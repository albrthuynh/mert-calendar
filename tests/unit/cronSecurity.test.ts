import { NextRequest } from "next/server";
import { POST } from "@/app/api/google-calendar/renew-watches/route";
import { renewGoogleCalendarWatches } from "@/lib/googleCalendar";

jest.mock("@/lib/googleCalendar", () => ({ renewGoogleCalendarWatches: jest.fn(async () => ({ renewed: 0 })) }));
jest.mock("@/lib/prisma", () => ({ prisma: {
  rateLimitBucket: { deleteMany: jest.fn() }, securityLease: { deleteMany: jest.fn() }, session: { deleteMany: jest.fn() },
} }));
const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; jest.clearAllMocks(); });

it("fails closed without a cron secret, including development, and accepts only its bearer token", async () => {
  delete process.env.CRON_SECRET;
  delete process.env.GOOGLE_CALENDAR_CRON_SECRET;
  expect((await POST(new NextRequest("https://calendar.example/api/google-calendar/renew-watches"))).status).toBe(401);
  process.env.CRON_SECRET = "private-cron-secret";
  expect((await POST(new NextRequest("https://calendar.example/api/google-calendar/renew-watches", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  expect(renewGoogleCalendarWatches).not.toHaveBeenCalled();
  expect((await POST(new NextRequest("https://calendar.example/api/google-calendar/renew-watches", { headers: { authorization: "Bearer private-cron-secret" } }))).status).toBe(200);
  expect(renewGoogleCalendarWatches).toHaveBeenCalledTimes(1);
});
