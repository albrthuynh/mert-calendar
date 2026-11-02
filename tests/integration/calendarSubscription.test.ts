import { NextRequest } from "next/server";
import { GET } from "@/app/api/calendar/subscribe/[token]/route";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() }, event: { findMany: jest.fn() } },
}));

const series = {
  id: "series", title: "Lunch", description: null, link: null,
  startTime: new Date("2026-10-25T17:30:00.000Z"), endTime: new Date("2026-10-25T18:30:00.000Z"),
  color: "#4285F4", allDay: false, recurrenceRule: "FREQ=WEEKLY;COUNT=4", recurrenceEndDate: null,
  reminderMinutes: 10, reminderDisabled: false, childEvents: [],
};

async function subscriptionContent(timeZone = "America/Chicago") {
  const response = await GET(
    new NextRequest(`http://localhost/api/calendar/subscribe/token?timeZone=${encodeURIComponent(timeZone)}`),
    { params: Promise.resolve({ token: "token" }) }
  );
  expect(response.status).toBe(200);
  return response.text();
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-28T12:00:00Z"));
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user", name: "Albert", defaultReminderMinutes: 10 });
  (prisma.event.findMany as jest.Mock).mockReset();
});
afterEach(() => jest.useRealTimers());

it("keeps 12:30 in Chicago through fall back, independently of the server timezone", async () => {
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([series]);
  const content = await subscriptionContent();
  expect(content).toContain("DTSTART:20261025T173000Z");
  expect(content).toContain("DTSTART:20261101T183000Z");
  expect(content).toContain("DTSTART:20261108T183000Z");
  expect(content).not.toContain("DTSTART:20261101T173000Z");
  expect(content).toContain("TRIGGER:-PT10M");
});

it("keeps 12:30 through spring forward", async () => {
  jest.setSystemTime(new Date("2026-03-01T12:00:00Z"));
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{
    ...series, startTime: new Date("2026-03-01T18:30:00Z"), endTime: new Date("2026-03-01T19:30:00Z"),
  }]);
  const content = await subscriptionContent();
  expect(content).toContain("DTSTART:20260301T183000Z");
  expect(content).toContain("DTSTART:20260308T173000Z");
});

it("preserves cancellations stored under the old fixed UTC occurrence key", async () => {
  const cancelled = {
    ...series, id: "cancelled", instanceId: "series__2026-11-01T17:30:00.000Z",
    startTime: new Date("2026-11-01T17:30:00Z"), endTime: new Date("2026-11-01T18:30:00Z"), deleted: true,
  };
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...series, childEvents: [cancelled] }]);
  const content = await subscriptionContent();
  expect(content).not.toContain("DTSTART:20261101");
  expect(content).toContain("DTSTART:20261108T183000Z");
});

it("exports edited occurrences at their explicitly chosen time", async () => {
  const edited = {
    ...series, id: "edited", instanceId: "series__2026-11-01T17:30:00.000Z", title: "Later lunch",
    startTime: new Date("2026-11-01T20:30:00Z"), endTime: new Date("2026-11-01T21:30:00Z"), deleted: false,
  };
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...series, childEvents: [edited] }]);
  const content = await subscriptionContent();
  expect(content).toContain("DTSTART:20261101T203000Z");
  expect(content).not.toContain("DTSTART:20261101T183000Z");
  expect(content).toContain("SUMMARY:Later lunch");
});

it("keeps all-day recurring dates stable across the clock change", async () => {
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{
    ...series, allDay: true, startTime: new Date("2026-10-25T00:00:00Z"), endTime: new Date("2026-10-26T00:00:00Z"),
  }]);
  const content = await subscriptionContent();
  expect(content).toContain("DTSTART;VALUE=DATE:20261025");
  expect(content).toContain("DTSTART;VALUE=DATE:20261101");
  expect(content).toContain("DTEND;VALUE=DATE:20261102");
});

it("leaves standalone event instants unchanged", async () => {
  (prisma.event.findMany as jest.Mock).mockResolvedValueOnce([{ ...series, recurrenceRule: null }]).mockResolvedValueOnce([]);
  expect(await subscriptionContent()).toContain("DTSTART:20261025T173000Z");
});
