import { NextRequest } from "next/server";
import { POST } from "@/app/api/events/route";
import { PUT } from "@/app/api/events/[id]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pushLocalEventToGoogle } from "@/lib/googleCalendar";
import { buildEventCopyPayload } from "@/lib/eventCopy";
import { expandRecurringEventForRange } from "@/lib/recurringEvents";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  event: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
} }));
jest.mock("@/lib/googleCalendar", () => ({
  pushLocalEventToGoogle: jest.fn(), syncGoogleCalendarForUser: jest.fn(), deleteLocalEventFromGoogle: jest.fn(),
}));

const original = {
  id: "source-series", originalId: "source-series", userId: "user-1", title: "Class", description: "Bring notes", link: null,
  startTime: new Date(2026, 9, 19, 11), endTime: new Date(2026, 9, 19, 12),
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", recurrenceEndDate: new Date("2026-12-10T00:00:00.000Z"),
  allDay: false, color: "#4285F4", reminderMinutes: 30, reminderDisabled: false,
  parentEventId: null, instanceId: null, googleEventId: "original-google-id", googleCalendarId: "primary", isRecurringInstance: true,
};

describe("copy and edit persistence", () => {
  let copied: typeof original;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-1" });
    (prisma.$transaction as jest.Mock).mockImplementation(async (operations) => Promise.all(operations));
    (prisma.event.create as jest.Mock).mockImplementation(async ({ data }) => {
      copied = { ...data, id: "independent-copy", googleEventId: null, googleCalendarId: null, parentEventId: null, instanceId: null };
      return copied;
    });
    (prisma.event.findFirst as jest.Mock).mockImplementation(async ({ where }) => where.id === copied?.id ? copied : original);
    (prisma.event.update as jest.Mock).mockImplementation(async ({ where, data }) => {
      expect(where.id).toBe("independent-copy");
      copied = { ...copied, ...data };
      return copied;
    });
    (pushLocalEventToGoogle as jest.Mock).mockResolvedValue(null);
  });

  async function createCopy(targetDay = new Date(2026, 9, 20)) {
    const payload = buildEventCopyPayload({
      ...original, startTime: original.startTime.toISOString(), endTime: original.endTime.toISOString(),
      recurrenceEndDate: original.recurrenceEndDate.toISOString(),
    }, targetDay);
    return POST(new NextRequest("http://localhost/api/events", {
      method: "POST", body: JSON.stringify(payload),
    }));
  }

  it("creates a new independent series, then edits it from a later occurrence without losing its first event", async () => {
    expect((await createCopy()).status).toBe(201);
    expect(copied).toMatchObject({ id: "independent-copy", parentEventId: null, instanceId: null, googleEventId: null,
      recurrenceRule: original.recurrenceRule, recurrenceEndDate: original.recurrenceEndDate });
    expect((prisma.event.create as jest.Mock).mock.calls[0][0].data).not.toHaveProperty("id");
    const response = await PUT(new NextRequest("http://localhost/api/events/independent-copy", {
      method: "PUT", body: JSON.stringify({
        title: "Edited copy", editScope: "series", timeZone,
        instanceStartTime: new Date(2026, 10, 9, 11).toISOString(),
        startTime: new Date(2026, 10, 9, 11).toISOString(), endTime: new Date(2026, 10, 9, 12).toISOString(),
      }),
    }), { params: Promise.resolve({ id: "independent-copy" }) });
    expect(response.status).toBe(200);
    expect(copied.startTime).toEqual(new Date(2026, 9, 20, 11));
    expect(copied.title).toBe("Edited copy");
    expect(original.title).toBe("Class");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const occurrences = expandRecurringEventForRange({ ...copied, childEvents: [] }, new Date(2026, 9, 20), new Date(2026, 10, 1), timeZone);
    expect(occurrences.map((event) => new Date(event.startTime).getDate())).toEqual([20, 26]);
    expect(pushLocalEventToGoogle).toHaveBeenLastCalledWith("user-1", "independent-copy", { timeZone });
  });

  it("rejects an edit that would hide the series before mutating or removing overrides", async () => {
    await createCopy();
    const response = await PUT(new NextRequest("http://localhost/api/events/independent-copy", {
      method: "PUT", body: JSON.stringify({ recurrenceEndDate: "2026-10-01T00:00:00.000Z", editScope: "series", timeZone }),
    }), { params: Promise.resolve({ id: "independent-copy" }) });
    expect(response.status).toBe(400);
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.event.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects invalid copy schedules on the server without creating an event", async () => {
    const response = await POST(new NextRequest("http://localhost/api/events", {
      method: "POST", body: JSON.stringify({ title: "Invalid copy", startTime: "2026-10-20T16:00:00.000Z", endTime: "2026-10-20T17:00:00.000Z",
        recurrenceRule: "FREQ=DAILY", recurrenceEndDate: "2026-10-01T00:00:00.000Z", timeZone }),
    }));
    expect(response.status).toBe(400);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });
});
