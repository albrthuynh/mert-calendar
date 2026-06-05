import {
  expandRecurringEventForRange,
  makeInstanceId,
  type RecurringEventSeries,
} from "@/lib/recurringEvents";

function baseSeries(overrides: Partial<RecurringEventSeries> = {}): RecurringEventSeries {
  return {
    id: "series-1",
    title: "Semester class",
    description: null,
    link: null,
    startTime: new Date("2025-08-20T13:30:00.000Z"),
    endTime: new Date("2025-08-20T15:20:00.000Z"),
    color: "#4285F4",
    allDay: false,
    recurrenceRule: "FREQ=WEEKLY",
    recurrenceEndDate: new Date("2025-12-10T00:00:00.000Z"),
    reminderMinutes: null,
    reminderDisabled: false,
    childEvents: [],
    ...overrides,
  };
}

function zonedParts(iso: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const values: Record<string, string> = {};

  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return values;
}

describe("recurring event expansion", () => {
  const timeZone = "America/Chicago";

  it("keeps weekly class wall time stable after daylight saving time ends", () => {
    const occurrences = expandRecurringEventForRange(
      baseSeries(),
      new Date("2025-11-01T05:00:00.000Z"),
      new Date("2025-11-30T05:59:59.999Z"),
      timeZone
    );

    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((event) => event.startTime)).toContain(
      "2025-11-05T14:30:00.000Z"
    );

    for (const occurrence of occurrences) {
      expect(zonedParts(occurrence.startTime, timeZone)).toMatchObject({
        hour: "08",
        minute: "30",
      });
    }
  });

  it("honors deleted overrides created with the old UTC-based instance key", () => {
    const legacyInstanceId = makeInstanceId(
      "series-1",
      "2025-11-05T13:30:00.000Z"
    );
    const occurrences = expandRecurringEventForRange(
      baseSeries({
        childEvents: [
          {
            id: "deleted-override",
            instanceId: legacyInstanceId,
            title: "Semester class",
            description: null,
            link: null,
            startTime: new Date("2025-11-05T13:30:00.000Z"),
            endTime: new Date("2025-11-05T15:20:00.000Z"),
            color: "#4285F4",
            allDay: false,
            reminderMinutes: null,
            reminderDisabled: false,
            deleted: true,
          },
        ],
      }),
      new Date("2025-11-01T05:00:00.000Z"),
      new Date("2025-11-30T05:59:59.999Z"),
      timeZone
    );

    expect(occurrences.map((event) => event.startTime)).not.toContain(
      "2025-11-05T14:30:00.000Z"
    );
    expect(occurrences).toHaveLength(3);
  });
});
