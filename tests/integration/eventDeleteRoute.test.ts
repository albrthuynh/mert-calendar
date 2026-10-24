import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/events/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteLocalEventFromGoogle, pushLocalEventToGoogle } from "@/lib/googleCalendar";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {
  event: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), delete: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock("@/lib/googleCalendar", () => ({
  deleteLocalEventFromGoogle: jest.fn(), pushLocalEventToGoogle: jest.fn(),
}));

const series = {
  id: "series-1", recurrenceRule: "FREQ=WEEKLY", recurrenceEndDate: null,
  startTime: new Date("2025-10-30T14:00:00.000Z"),
  googleCalendarId: "primary", googleEventId: "google-series", parentEventId: null,
};

function deleteFollowing(instanceStartTime = "2025-11-06T15:00:00.000Z", editScope = "following") {
  return DELETE(new NextRequest("http://localhost/api/events/series-1", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editScope, instanceStartTime, timeZone: "America/Chicago" }),
  }), { params: Promise.resolve({ id: series.id }) });
}

describe("delete following occurrences API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.event.findFirst as jest.Mock).mockResolvedValue(series);
    (prisma.event.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$transaction as jest.Mock).mockResolvedValue([]);
    (pushLocalEventToGoogle as jest.Mock).mockResolvedValue(null);
    (deleteLocalEventFromGoogle as jest.Mock).mockResolvedValue(undefined);
  });

  it("truncates the master and removes future overrides using their original dates", async () => {
    const earlier = { id: "earlier", instanceId: "series-1__2025-10-30T14:00:00.000Z" };
    const movedSelected = { id: "selected", instanceId: "series-1__2025-11-06T14:00:00.000Z", startTime: new Date("2025-10-29T14:00:00.000Z") };
    const later = { id: "later", instanceId: "series-1__2025-11-13T15:00:00.000Z" };
    (prisma.event.findMany as jest.Mock).mockResolvedValue([earlier, movedSelected, later]);
    expect((await deleteFollowing()).status).toBe(200);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: series.id }, data: { recurrenceRule: "FREQ=WEEKLY;COUNT=1", recurrenceEndDate: null },
    });
    expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["selected", "later"] } } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(pushLocalEventToGoogle).toHaveBeenCalledWith("user-1", series.id, { timeZone: "America/Chicago" });
    expect(deleteLocalEventFromGoogle).toHaveBeenCalledTimes(2);
    expect(prisma.event.delete).not.toHaveBeenCalled();
  });

  it("deletes the whole series when selecting its first occurrence", async () => {
    expect((await deleteFollowing(series.startTime.toISOString())).status).toBe(200);
    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: series.id } });
    expect(deleteLocalEventFromGoogle).toHaveBeenCalledWith("user-1", expect.objectContaining({ googleEventId: "google-series" }));
  });

  it.each([
    ["invalid", "following"], ["2025-11-07T15:00:00.000Z", "following"],
    ["2025-11-06T15:00:00.000Z", "unknown-scope"],
  ])("rejects invalid occurrence or scope (%s, %s)", async (timestamp, scope) => {
    expect((await deleteFollowing(timestamp, scope)).status).toBe(400);
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.event.delete).not.toHaveBeenCalled();
  });

  it("requires authentication and rejects read-only calendars", async () => {
    (auth as jest.Mock).mockResolvedValueOnce(null);
    expect((await deleteFollowing()).status).toBe(401);
    (prisma.event.findFirst as jest.Mock).mockResolvedValue({ ...series, googleCalendarId: "shared@example.com" });
    expect((await deleteFollowing()).status).toBe(403);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});
