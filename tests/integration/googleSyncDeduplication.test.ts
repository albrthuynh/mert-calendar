import { syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: jest.fn(), update: jest.fn() },
  account: { findFirst: jest.fn() },
  event: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  googleCalendarSource: { findMany: jest.fn() },
} }));

describe("Google sync deduplication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ googleCalendarSyncEnabled: true, googleCalendarSyncToken: "token" });
    (prisma.account.findFirst as jest.Mock).mockResolvedValue({ access_token: "access", expires_at: Date.now() / 1000 + 3600, scope: "https://www.googleapis.com/auth/calendar.events" });
    (prisma.googleCalendarSource.findMany as jest.Mock).mockResolvedValue([]);
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ items: [{
      id: "google-event", etag: "version-1", summary: "Meeting",
      start: { dateTime: "2026-10-28T12:00:00Z" }, end: { dateTime: "2026-10-28T13:00:00Z" },
    }], nextSyncToken: "next" }));
  });
  afterEach(() => jest.restoreAllMocks());

  it("does not rewrite an unchanged mapped event", async () => {
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ id: "local", googleEtag: "version-1", deleted: false });
    expect(await syncGoogleCalendarForUser("unchanged", { force: true })).toMatchObject({ changed: false });
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("persists a changed version and restores a previously deleted event", async () => {
    for (const existing of [
      { id: "local", googleEtag: "older", deleted: false },
      { id: "local", googleEtag: "version-1", deleted: true },
    ]) {
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(existing);
      expect(await syncGoogleCalendarForUser("changed", { force: true })).toMatchObject({ changed: true });
    }
    expect(prisma.event.update).toHaveBeenCalledTimes(2);
  });

  it("keeps other Google calendars authoritative even if an event carries Mert metadata", async () => {
    const sourceId = "shared@example.com";
    const sourceUpdate = jest.fn();
    Object.assign(prisma.googleCalendarSource, { update: sourceUpdate });
    (prisma.googleCalendarSource.findMany as jest.Mock).mockResolvedValue([{ id: "source", calendarId: sourceId }]);
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ id: "local", googleManagedByMert: true });
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string) => Response.json({ items: url.includes("/primary/") ? [] : [{
      id: "google-event", summary: "Changed by owner",
      start: { dateTime: "2026-11-02T18:30:00Z", timeZone: "America/Chicago" },
      end: { dateTime: "2026-11-02T19:30:00Z", timeZone: "America/Chicago" },
      extendedProperties: { private: { mertEventId: "local" } },
    }] }));
    await syncGoogleCalendarForUser("shared", { force: true });
    expect(prisma.event.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      title: "Changed by owner", timeZone: "America/Chicago", googleCalendarId: sourceId,
    }) }));
    expect(sourceUpdate).toHaveBeenCalled();
    for (const [, request] of (globalThis.fetch as jest.Mock).mock.calls) {
      expect(request.method).not.toBe("PATCH");
    }
  });
});
