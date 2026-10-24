import { pushLocalEventToGoogle, syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { expandRecurringEventForRange, type RecurringEventSeries } from "@/lib/recurringEvents";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: jest.fn(), update: jest.fn() },
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
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(event);
    let googleEvent: Record<string, unknown> = {};
    fetchMock.mockImplementation(async (_url, request) => {
      if (request?.method === "PATCH") {
        googleEvent = { id: "google-copy", ...JSON.parse(request.body) };
        return Response.json(googleEvent);
      }
      return Response.json({ items: [googleEvent], nextSyncToken: "next-token" });
    });
    await pushLocalEventToGoogle("user-1", event.id, { timeZone: "America/Chicago" });
    await syncGoogleCalendarForUser("user-1", { force: true });
    const importedEvent = (prisma.event.update as jest.Mock).mock.calls.at(-1)[0].data;
    return { googleEvent, importedEvent };
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
