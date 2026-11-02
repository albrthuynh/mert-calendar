import { POST } from "@/app/api/google-calendar/sync/route";
import { auth } from "@/lib/auth";
import { getGoogleCalendarStatus, repairMertEventsInGoogle, syncGoogleCalendarForUser } from "@/lib/googleCalendar";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/googleCalendar", () => ({
  getGoogleCalendarStatus: jest.fn(), repairMertEventsInGoogle: jest.fn(), syncGoogleCalendarForUser: jest.fn(),
  ensureGoogleCalendarWatches: jest.fn().mockResolvedValue({ expiration: null }), isGoogleCalendarSyncError: jest.fn().mockReturnValue(false),
}));

it("repairs Mert's Google copies before importing Google changes on manual sync", async () => {
  (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
  (getGoogleCalendarStatus as jest.Mock).mockResolvedValue({ connected: true, hasCalendarScope: true, enabled: true });
  const operations: string[] = [];
  (repairMertEventsInGoogle as jest.Mock).mockImplementation(async () => {
    operations.push("repair");
    return { repairedCount: 2 };
  });
  (syncGoogleCalendarForUser as jest.Mock).mockImplementation(async () => {
    operations.push("import");
    return { changed: false };
  });
  const response = await POST(new Request("http://localhost/api/google-calendar/sync", {
    method: "POST", body: JSON.stringify({ timeZone: "America/Chicago" }),
  }));
  expect(response.status).toBe(200);
  expect(operations).toEqual(["repair", "import"]);
  expect(repairMertEventsInGoogle).toHaveBeenCalledWith("user-1", "America/Chicago");
  expect(syncGoogleCalendarForUser).toHaveBeenCalledWith("user-1", { force: true, full: true });
  expect(await response.json()).toMatchObject({ repairedCount: 2 });
});
