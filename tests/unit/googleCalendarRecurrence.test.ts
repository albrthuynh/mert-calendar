import { pushLocalEventToGoogle, repairMertEventsInGoogle, syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { expandRecurringEventForRange, type RecurringEventSeries } from "@/lib/recurringEvents";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    account: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    googleCalendarChannel: { findFirst: jest.fn() },
    googleCalendarSource: { findMany: jest.fn() },
  },
}));

const copiedEvent: RecurringEventSeries & { parentEventId: null; googleEventId: string } = {
  id: "copied-event", title: "Copied event", description: null, link: null,
  startTime: new Date("2026-10-24T04:00:00.000Z"),
  endTime: new Date("2026-10-24T04:30:00.000Z"),
  color: "#4285F4", allDay: false, parentEventId: null,
  recurrenceRule: "FREQ=DAILY", recurrenceEndDate: new Date("2026-10-25T00:00:00.000Z"),
  googleCalendarId: "primary", googleEventId: "google-copy",
  reminderMinutes: null, reminderDisabled: false, childEvents: [],
};

describe("Google Calendar recurrence end date round trip", () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(copiedEvent);
    (prisma.event.update as jest.Mock).mockResolvedValue(copiedEvent);
    (prisma.account.findFirst as jest.Mock).mockResolvedValue({
      id: "account-1", access_token: "valid-token", refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      scope: "https://www.googleapis.com/auth/calendar.events",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ googleCalendarSyncEnabled: true });
    (prisma.googleCalendarChannel.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.googleCalendarSource.findMany as jest.Mock).mockResolvedValue([]);
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => fetchMock.mockRestore());

  async function pushAndSync(event = copiedEvent) {
    const storedEvent = { ...event };
    (prisma.event.findFirst as jest.Mock).mockImplementation(async () => ({ ...storedEvent }));
    (prisma.event.update as jest.Mock).mockImplementation(async ({ data }) => Object.assign(storedEvent, data));
    let googleEvent: Record<string, unknown> = {};
    fetchMock.mockImplementation(async (_url, request) => {
      if (request?.method === "PATCH") {
        googleEvent = { id: "google-copy", etag: "pushed-version", ...JSON.parse(request.body) };
        return Response.json(googleEvent);
      }
      return Response.json({ items: [googleEvent], nextSyncToken: "next-token" });
    });
    await pushLocalEventToGoogle("user-1", event.id, { timeZone: "America/Chicago" });
    await syncGoogleCalendarForUser("user-1", { force: true });
    return { googleEvent, importedEvent: storedEvent };
  }

  it("retains the selected day after sync and includes its late-night occurrence", async () => {
    const { googleEvent, importedEvent } = await pushAndSync();
    expect(googleEvent.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261026T045959Z"]);
    expect(importedEvent.recurrenceEndDate).toEqual(copiedEvent.recurrenceEndDate);
    expect(importedEvent.recurrenceRule).toBe("FREQ=DAILY");
    const occurrences = expandRecurringEventForRange(
      { ...copiedEvent, ...importedEvent },
      new Date("2026-10-23T05:00:00.000Z"),
      new Date("2026-10-28T05:00:00.000Z"),
      "America/Chicago"
    );
    expect(occurrences.map((event) => event.startTime)).toEqual([
      "2026-10-24T04:00:00.000Z", "2026-10-25T04:00:00.000Z", "2026-10-26T04:00:00.000Z",
    ]);
  });

  it("extends a selected end date across DST", async () => {
    const { googleEvent, importedEvent } = await pushAndSync({
      ...copiedEvent,
      recurrenceEndDate: new Date("2026-11-02T00:00:00.000Z"),
    });
    expect(googleEvent.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261103T055959Z"]);
    expect(importedEvent.recurrenceEndDate).toEqual(new Date("2026-11-02T00:00:00.000Z"));
  });

  it("preserves a copied count limit and its separate ends-on date through sync", async () => {
    const { googleEvent, importedEvent } = await pushAndSync({ ...copiedEvent, recurrenceRule: "FREQ=DAILY;COUNT=1" });
    expect(googleEvent.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261024T040000Z"]);
    expect(importedEvent.recurrenceRule).toBe("FREQ=DAILY;COUNT=1");
    expect(importedEvent.recurrenceEndDate).toEqual(copiedEvent.recurrenceEndDate);
  });

  it("keeps the series unbounded after clearing the selected end date", async () => {
    const { googleEvent, importedEvent } = await pushAndSync({ ...copiedEvent, recurrenceEndDate: null });
    expect(googleEvent.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
    expect(importedEvent.recurrenceEndDate).toBeNull();
  });

  it("keeps a copy on its chosen day without shifting its original weekday schedule", async () => {
    const { googleEvent, importedEvent } = await pushAndSync({ ...copiedEvent, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(googleEvent.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261026T045959Z", "RDATE:20261024T040000Z",
    ]);
    expect(importedEvent.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
    const events = expandRecurringEventForRange({ ...copiedEvent, ...importedEvent },
      new Date("2026-10-23T05:00:00.000Z"), new Date("2026-10-24T05:00:00.000Z"), "America/Chicago");
    expect(events).toHaveLength(1);
  });

  it("clears Google's recurrence when a copied series is changed to a one-off event", async () => {
    const { googleEvent } = await pushAndSync({ ...copiedEvent, recurrenceRule: null, recurrenceEndDate: null });
    expect(googleEvent.recurrence).toEqual([]);
  });

  it("uses a date-only UNTIL for an all-day event", async () => {
    const { googleEvent, importedEvent } = await pushAndSync({ ...copiedEvent, allDay: true });
    expect(googleEvent.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261025"]);
    expect(importedEvent.recurrenceEndDate).toEqual(copiedEvent.recurrenceEndDate);
  });

  it("preserves Google's recurrence time zone for updates without a browser time zone", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: "google-copy", start: { timeZone: "America/Chicago" } }))
      .mockResolvedValueOnce(Response.json({ id: "google-copy" }));
    await pushLocalEventToGoogle("user-1", copiedEvent.id);
    const request = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(request.start.timeZone).toBe("America/Chicago");
    expect(request.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261026T045959Z"]);
  });

  it("repairs a legacy UTC Google copy in place using the browser's named zone", async () => {
    (prisma.event.findMany as jest.Mock).mockResolvedValue([copiedEvent]);
    fetchMock.mockResolvedValueOnce(Response.json({
      id: "google-copy", start: { timeZone: "UTC" },
      extendedProperties: { private: { mertEventId: copiedEvent.id } },
    })).mockResolvedValueOnce(Response.json({ id: "google-copy", etag: "repaired" }));

    expect(await repairMertEventsInGoogle("user-1", "America/Chicago")).toEqual({ repairedCount: 1 });
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toContain("/events/google-copy?");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body).start).toEqual({ dateTime: copiedEvent.startTime.toISOString(), timeZone: "America/Chicago" });
    expect((prisma.event.update as jest.Mock).mock.calls.at(-1)[0].data).toMatchObject({
      timeZone: "America/Chicago", googleManagedByMert: true,
    });
  });

  it("does not repair Google-origin events that Mert has never published", async () => {
    (prisma.event.findMany as jest.Mock).mockResolvedValue([copiedEvent]);
    fetchMock.mockResolvedValue(Response.json({ id: "google-copy" }));
    expect(await repairMertEventsInGoogle("user-1", "America/Chicago")).toEqual({ repairedCount: 0 });
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["confirmed", "cancelled"])("restores Mert's schedule when a Google copy is %s", async (status) => {
    const managedEvent = { ...copiedEvent, timeZone: "America/Chicago", googleManagedByMert: true };
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(managedEvent);
    fetchMock.mockImplementation(async (_url, request) => {
      if (request?.method === "PATCH") return Response.json({ id: "google-copy", etag: "restored" });
      return Response.json({ items: [{
        id: "google-copy", status, etag: "google-changed",
        summary: "Changed in Google", start: { dateTime: "2026-10-24T03:00:00Z" },
        end: { dateTime: "2026-10-24T03:30:00Z" },
      }] });
    });
    await syncGoogleCalendarForUser("user-1", { force: true });
    const patchRequest = fetchMock.mock.calls.find(([, request]) => request?.method === "PATCH")![1];
    expect(JSON.parse(patchRequest.body)).toMatchObject({
      summary: copiedEvent.title, status: "confirmed",
      start: { dateTime: copiedEvent.startTime.toISOString(), timeZone: "America/Chicago" },
    });
    for (const [update] of (prisma.event.update as jest.Mock).mock.calls) {
      expect(update.data).not.toHaveProperty("startTime");
      expect(update.data).not.toHaveProperty("recurrenceRule");
    }
  });

  it("uses the saved event time zone when the browser has travelled", async () => {
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ ...copiedEvent, timeZone: "America/Chicago" });
    fetchMock.mockResolvedValue(Response.json({ id: "google-copy" }));
    await pushLocalEventToGoogle("user-1", copiedEvent.id, { timeZone: "Europe/London" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start.timeZone).toBe("America/Chicago");
  });

  it.each(["confirmed", "cancelled"])("restores a %s Google exception using Mert's occurrence time after DST", async (status) => {
    const parent = {
      ...copiedEvent, googleEventId: "google-series", googleManagedByMert: true, timeZone: "America/Chicago",
      startTime: new Date("2026-10-25T17:30:00Z"), endTime: new Date("2026-10-25T18:30:00Z"),
      recurrenceRule: "FREQ=WEEKLY;COUNT=3", recurrenceEndDate: null, childEvents: [],
    };
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(parent);
    fetchMock.mockImplementation(async (_url, request) => {
      if (request?.method === "PATCH") return Response.json({ id: "google-instance" });
      return Response.json({ items: [{
        id: "google-instance", recurringEventId: "google-series", status,
        originalStartTime: { dateTime: "2026-11-01T17:30:00Z" },
        start: { dateTime: "2026-11-01T16:30:00Z" }, end: { dateTime: "2026-11-01T17:30:00Z" },
      }] });
    });
    await syncGoogleCalendarForUser("user-1", { force: true });
    const [url, request] = fetchMock.mock.calls.find(([, request]) => request?.method === "PATCH")!;
    expect(url).toContain("/events/google-instance");
    expect(JSON.parse(request.body)).toMatchObject({
      status: "confirmed", start: { dateTime: "2026-11-01T18:30:00.000Z" },
      end: { dateTime: "2026-11-01T19:30:00.000Z" },
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("does not repeatedly patch a Google occurrence that already matches Mert", async () => {
    const parent = { ...copiedEvent, timeZone: "America/Chicago", googleManagedByMert: true, childEvents: [] };
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(parent);
    fetchMock.mockResolvedValue(Response.json({ items: [{
      id: "google-instance", recurringEventId: "google-copy", summary: parent.title,
      originalStartTime: { dateTime: parent.startTime.toISOString() },
      start: { dateTime: parent.startTime.toISOString() }, end: { dateTime: parent.endTime.toISOString() },
    }] }));
    await syncGoogleCalendarForUser("user-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("requires a named time zone instead of silently creating a UTC series", async () => {
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ ...copiedEvent, googleEventId: null });
    await expect(pushLocalEventToGoogle("user-1", copiedEvent.id)).rejects.toThrow("time zone");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not adopt an old Google UTC zone before the user runs repair", async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [{
      id: "google-copy", etag: "google-changed", summary: "Legacy copy",
      start: { dateTime: copiedEvent.startTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: copiedEvent.endTime.toISOString(), timeZone: "UTC" },
      extendedProperties: { private: { mertEventId: copiedEvent.id } },
    }] }));
    await syncGoogleCalendarForUser("user-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: copiedEvent.id }, data: { googleManagedByMert: true },
    });
  });

  it("honors an end date subsequently edited in Google", async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [{
      id: "google-copy", summary: "Copied event",
      start: { dateTime: copiedEvent.startTime.toISOString(), timeZone: "America/Chicago" },
      end: { dateTime: copiedEvent.endTime.toISOString(), timeZone: "America/Chicago" },
      recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261028T045959Z"],
      extendedProperties: { private: { mertRecurrenceEndDate: copiedEvent.recurrenceEndDate?.toISOString() } },
    }] }));
    await syncGoogleCalendarForUser("user-1", { force: true });
    expect((prisma.event.update as jest.Mock).mock.calls.at(-1)[0].data).toMatchObject({
      recurrenceRule: "FREQ=DAILY;UNTIL=20261028T045959Z", recurrenceEndDate: null,
    });
  });
});
