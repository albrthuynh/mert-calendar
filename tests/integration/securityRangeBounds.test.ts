import { NextRequest } from "next/server";
import { GET } from "@/app/api/events/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { validateEventSchedule } from "@/lib/recurringEvents";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: jest.fn() }, event: { findMany: jest.fn() } } }));
jest.mock("@/lib/googleCalendar", () => ({ syncGoogleCalendarForUser: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { id: "bounded-user" } });
});

it.each([["invalid", "2026-01-01"], ["2026-01-02", "2026-01-01"], ["2026-01-01", "2030-01-01"]])("rejects unsafe ranges before syncing or reading events", async (start, end) => {
  const response = await GET(new NextRequest(`https://calendar.example/api/events?start=${start}&end=${end}`));
  expect(response.status).toBe(400);
  expect(syncGoogleCalendarForUser).not.toHaveBeenCalled();
  expect(prisma.event.findMany).not.toHaveBeenCalled();
});

it("refuses oversized result sets instead of truncating or expanding them", async () => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ eventsRevision: BigInt(1) });
  (syncGoogleCalendarForUser as jest.Mock).mockResolvedValue({ changed: false });
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce(Array(2001).fill({ id: "event" })).mockResolvedValueOnce([]);
  const response = await GET(new NextRequest("https://calendar.example/api/events?start=2026-01-01&end=2026-02-01"));
  expect(response.status).toBe(422);
  expect(prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2001 }));
});

it.each(["FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;INTERVAL=-1", "FREQ=DAILY;BYHOUR=99999", "FREQ=SECONDLY", "FREQ=MINUTELY", "FREQ=DAILY;BYHOUR=1,2,3,4,5;BYMINUTE=1,2,3,4,5"]) ("rejects recurrence schedules that could flood a range: %s", (recurrenceRule) => {
  expect(() => validateEventSchedule({ startTime: new Date("2026-01-01"), endTime: new Date("2026-01-02"), recurrenceRule, recurrenceEndDate: null }, "UTC")).toThrow();
});
