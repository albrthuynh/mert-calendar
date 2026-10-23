import { getGoogleEventGuests, inviteGoogleEventGuests } from "@/lib/googleCalendar";
import { normalizeGuestEmails } from "@/lib/eventGuests";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: jest.fn(), update: jest.fn() },
    account: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    googleCalendarChannel: { findFirst: jest.fn() },
  },
}));

const localEvent = {
  id: "local-1", title: "Meetup", description: null, link: null, deleted: false,
  startTime: new Date("2026-10-23T19:00:00.000Z"), endTime: new Date("2026-10-23T20:00:00.000Z"),
  color: "#4285F4", allDay: false, parentEventId: null, instanceId: null, recurrenceRule: null,
  googleCalendarId: "primary", googleEventId: "google-1",
};
const googleEvent = {
  id: "google-1", etag: '"v1"', organizer: { self: true },
  attendees: [{ email: "existing@example.com", responseStatus: "accepted", optional: true }],
};

describe("Google Calendar guest invitations", () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(localEvent);
    (prisma.event.update as jest.Mock).mockResolvedValue(localEvent);
    (prisma.account.findFirst as jest.Mock).mockResolvedValue({
      id: "account-1", access_token: "valid-token", refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      scope: "https://www.googleapis.com/auth/calendar.events",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ googleCalendarSyncEnabled: true });
    (prisma.googleCalendarChannel.findFirst as jest.Mock).mockResolvedValue(null);
    fetchMock = jest.spyOn(globalThis, "fetch");
  });
  afterEach(() => fetchMock.mockRestore());

  it("validates and deduplicates addresses", () => {
    expect(normalizeGuestEmails([" Friend@Example.com ", "friend@example.com"])).toEqual(["friend@example.com"]);
    for (const value of [[], ["invalid"], ["a@b.com\nBcc: someone@example.com"], [42]]) {
      expect(() => normalizeGuestEmails(value)).toThrow();
    }
  });

  it("sends Google notifications and preserves existing RSVPs and guest properties", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(googleEvent)).mockResolvedValueOnce(Response.json({ ...googleEvent, etag: '"v2"' }));
    expect(await inviteGoogleEventGuests("user-1", "local-1", ["NEW@example.com"], { scope: "event" })).toEqual({ invitedCount: 1 });
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toContain("/events/google-1?sendUpdates=all");
    expect(request.headers["If-Match"]).toBe('"v1"');
    expect(JSON.parse(request.body).attendees).toEqual([
      ...googleEvent.attendees, { email: "new@example.com" },
    ]);
    expect(prisma.event.findFirst).toHaveBeenCalledWith({ where: { id: "local-1", userId: "user-1", deleted: false } });
  });

  it("does not resend invitations to existing guests", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(googleEvent));
    expect(await inviteGoogleEventGuests("user-1", "local-1", ["EXISTING@example.com"], { scope: "event" })).toEqual({ invitedCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reloads and merges a simultaneous RSVP change before retrying", async () => {
    const changedGuest = { email: "existing@example.com", responseStatus: "declined" };
    fetchMock
      .mockResolvedValueOnce(Response.json(googleEvent))
      .mockResolvedValueOnce(Response.json({}, { status: 412 }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, etag: '"v2"', attendees: [changedGuest] }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, etag: '"v3"' }));
    await inviteGoogleEventGuests("user-1", "local-1", ["new@example.com"], { scope: "event" });
    const request = fetchMock.mock.calls[3][1];
    expect(request.headers["If-Match"]).toBe('"v2"');
    expect(JSON.parse(request.body).attendees[0]).toEqual(changedGuest);
  });

  it("refuses to overwrite a guest list Google marked incomplete", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...googleEvent, attendeesOmitted: true }));
    await expect(inviteGoogleEventGuests("user-1", "local-1", ["new@example.com"], { scope: "event" })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires organizer access and an enabled Google connection", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...googleEvent, organizer: { self: false } }));
    await expect(getGoogleEventGuests("user-1", "local-1", { scope: "event" })).rejects.toMatchObject({ status: 403 });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ googleCalendarSyncEnabled: false });
    await expect(inviteGoogleEventGuests("user-1", "local-1", ["new@example.com"], { scope: "event" })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not access Google for another user's event or a read-only calendar", async () => {
    (prisma.event.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(getGoogleEventGuests("other-user", "local-1", { scope: "event" })).rejects.toMatchObject({ status: 404 });
    (prisma.event.findFirst as jest.Mock).mockResolvedValueOnce({ ...localEvent, googleCalendarId: "shared@example.com" });
    await expect(getGoogleEventGuests("user-1", "local-1", { scope: "event" })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets one original occurrence without inviting the whole series", async () => {
    (prisma.event.findFirst as jest.Mock)
      .mockResolvedValueOnce({ ...localEvent, recurrenceRule: "FREQ=WEEKLY" })
      .mockResolvedValueOnce(null);
    fetchMock
      .mockResolvedValueOnce(Response.json({ items: [{ id: "instance-1" }] }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, id: "instance-1" }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, id: "instance-1" }));
    await inviteGoogleEventGuests("user-1", "local-1", ["new@example.com"], { scope: "event", instanceStartTime: "2026-10-22T19:00:00.000Z" });
    expect(fetchMock.mock.calls[0][0]).toContain("/events/google-1/instances?originalStart=2026-10-22T19%3A00%3A00.000Z");
    expect(fetchMock.mock.calls[2][0]).toContain("/events/instance-1?sendUpdates=all");
  });

  it("retains a moved occurrence's new time when inviting only that event", async () => {
    const movedOccurrence = { ...localEvent, id: "override-1", parentEventId: "local-1", googleEventId: null, instanceId: "local-1__2026-10-22T19:00:00.000Z" };
    (prisma.event.findFirst as jest.Mock)
      .mockResolvedValueOnce(movedOccurrence)
      .mockResolvedValueOnce({ ...localEvent, recurrenceRule: "FREQ=WEEKLY" });
    fetchMock
      .mockResolvedValueOnce(Response.json({ items: [{ id: "instance-1" }] }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, id: "instance-1" }))
      .mockResolvedValueOnce(Response.json({ ...googleEvent, id: "instance-1" }));
    await inviteGoogleEventGuests("user-1", "override-1", ["new@example.com"], { scope: "event", instanceStartTime: "2026-10-22T19:00:00.000Z" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).start.dateTime).toBe("2026-10-23T19:00:00.000Z");
    expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "override-1" } }));
  });

  it("uses the series endpoint when the user explicitly selects the whole series", async () => {
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ ...localEvent, recurrenceRule: "FREQ=WEEKLY" });
    fetchMock.mockResolvedValueOnce(Response.json(googleEvent)).mockResolvedValueOnce(Response.json(googleEvent));
    await inviteGoogleEventGuests("user-1", "local-1", ["new@example.com"], { scope: "series" });
    expect(fetchMock.mock.calls[1][0]).toContain("/events/google-1?sendUpdates=all");
  });
});
