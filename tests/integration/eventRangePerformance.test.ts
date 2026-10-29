import { NextRequest } from "next/server";
import { GET } from "@/app/api/events/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: jest.fn() }, event: { findMany: jest.fn() } } }));
jest.mock("@/lib/googleCalendar", () => ({ syncGoogleCalendarForUser: jest.fn().mockResolvedValue({ changed: false }) }));

it("retains moved-out and cancelled occurrence identities while bounding override reads", async () => {
  (auth as jest.Mock).mockResolvedValue({ user: { id: "range-test" } });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ eventsRevision: BigInt(1) });
  const series = {
    id: "series", title: "Weekly", description: null, link: null,
    startTime: new Date("2026-10-21T12:00:00Z"), endTime: new Date("2026-10-21T13:00:00Z"),
    recurrenceRule: "FREQ=WEEKLY", recurrenceEndDate: null, color: "#123456", allDay: false,
    reminderDisabled: false, reminderMinutes: null,
  };
  const moved = { ...series, id: "override", parentEventId: "series", instanceId: "series__2026-10-28T12:00:00.000Z",
    startTime: new Date("2026-12-01T12:00:00Z"), endTime: new Date("2026-12-01T13:00:00Z"), deleted: false };
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([series]).mockResolvedValueOnce([moved]);
  const request = new NextRequest("http://localhost/api/events?start=2026-10-28T00:00:00Z&end=2026-10-28T23:59:59Z&timeZone=UTC");
  expect(await (await GET(request)).json()).toEqual([]);
  const overrideQuery = (prisma.event.findMany as jest.Mock).mock.calls[2][0];
  expect(overrideQuery.where.parentEventId).toEqual({ in: ["series"] });
  expect(overrideQuery.where.OR).toEqual(expect.arrayContaining([
    expect.objectContaining({ instanceId: expect.objectContaining({ gte: expect.stringContaining("series__2026-10-26") }) }),
    expect.objectContaining({ startTime: expect.anything(), endTime: expect.anything() }),
  ]));
  expect(overrideQuery.where).not.toHaveProperty("deleted");
  await GET(request);
  expect(prisma.event.findMany).toHaveBeenCalledTimes(3);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ eventsRevision: BigInt(2) });
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([series]).mockResolvedValueOnce([{ ...moved, deleted: true }]);
  expect(await (await GET(request)).json()).toEqual([]);
  expect(prisma.event.findMany).toHaveBeenCalledTimes(6);
});
