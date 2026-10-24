import {
  expandRecurringEventForRange,
  makeInstanceId,
  truncateSeriesBeforeInstance,
  type RecurringEventOverride,
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

describe("deleting this and following recurring events", () => {
  const timeZone = "America/Chicago";
  const series = baseSeries({
    startTime: new Date("2025-10-30T14:00:00.000Z"),
    endTime: new Date("2025-10-30T15:00:00.000Z"),
  });

  it("preserves earlier occurrences across DST and removes future overrides", () => {
    const truncated = truncateSeriesBeforeInstance(series, new Date("2025-11-13T15:00:00.000Z"), timeZone);
    expect(truncated.recurrenceRule).toBe("FREQ=WEEKLY;COUNT=2");
    const events = expandRecurringEventForRange(
      { ...series, recurrenceRule: truncated.recurrenceRule, recurrenceEndDate: null },
      new Date("2025-10-29T00:00:00.000Z"), new Date("2025-12-31T00:00:00.000Z"), timeZone
    );
    expect(events.map((event) => event.startTime)).toEqual([
      "2025-10-30T14:00:00.000Z", "2025-11-06T15:00:00.000Z",
    ]);
  });

  it("accepts legacy occurrence identities and handles the first occurrence", () => {
    expect(truncateSeriesBeforeInstance(series, new Date("2025-11-06T14:00:00.000Z"), timeZone).recurrenceRule)
      .toBe("FREQ=WEEKLY;COUNT=1");
    expect(truncateSeriesBeforeInstance(series, series.startTime, timeZone).recurrenceRule).toBeNull();
  });

  it("retains earlier occurrences on the same day", () => {
    const dailySeries = { ...series, recurrenceRule: "FREQ=DAILY;BYHOUR=9,15;COUNT=10" };
    expect(truncateSeriesBeforeInstance(dailySeries, new Date("2025-10-30T20:00:00.000Z"), timeZone).recurrenceRule)
      .toBe("FREQ=DAILY;BYHOUR=9,15;COUNT=1");
  });

  it("rejects timestamps outside the series without deleting anything", () => {
    for (const timestamp of ["invalid", "2025-10-29T14:00:00.000Z", "2025-11-07T15:00:00.000Z", "2026-01-01T15:00:00.000Z"]) {
      expect(() => truncateSeriesBeforeInstance(series, new Date(timestamp), timeZone)).toThrow();
    }
  });
});

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

  function movedThursdayOccurrence(
    changes: Partial<RecurringEventOverride> = {}
  ): RecurringEventOverride {
    return {
      id: "moved-occurrence",
      instanceId: makeInstanceId("series-1", "2025-11-06T15:00:00.000Z"),
      title: "Thursday event moved to Friday",
      description: null,
      link: null,
      startTime: new Date("2025-11-07T15:00:00.000Z"),
      endTime: new Date("2025-11-07T16:00:00.000Z"),
      color: "#4285F4",
      allDay: false,
      reminderMinutes: null,
      reminderDisabled: false,
      deleted: false,
      ...changes,
    };
  }

  function thursdaySeries(override: RecurringEventOverride) {
    return baseSeries({
      startTime: new Date("2025-10-30T14:00:00.000Z"),
      endTime: new Date("2025-10-30T15:00:00.000Z"),
      childEvents: [override],
    });
  }

  it("shows a Thursday occurrence moved to Friday in both week and Friday-only requests", () => {
    const series = thursdaySeries(movedThursdayOccurrence());
    const fridayStart = new Date("2025-11-07T06:00:00.000Z");
    const fridayEnd = new Date("2025-11-08T05:59:59.999Z");
    const weekEvents = expandRecurringEventForRange(
      series,
      new Date("2025-11-02T05:00:00.000Z"),
      new Date("2025-11-09T05:59:59.999Z"),
      timeZone
    );
    const fridayEvents = expandRecurringEventForRange(series, fridayStart, fridayEnd, timeZone);
    expect(fridayEvents).toHaveLength(1);
    expect(fridayEvents).toEqual(weekEvents.filter((event) =>
      new Date(event.startTime) <= fridayEnd && new Date(event.endTime) > fridayStart
    ));
    expect(fridayEvents[0]).toMatchObject({
      id: "moved-occurrence",
      originalId: "series-1",
      instanceStartTime: "2025-11-06T15:00:00.000Z",
      startTime: "2025-11-07T15:00:00.000Z",
    });
  });

  it("omits the moved occurrence from its original Thursday", () => {
    const events = expandRecurringEventForRange(
      thursdaySeries(movedThursdayOccurrence()),
      new Date("2025-11-06T06:00:00.000Z"),
      new Date("2025-11-07T05:59:59.999Z"),
      timeZone
    );
    expect(events).toEqual([]);
  });

  it("includes a moved occurrence after the series recurrence end date", () => {
    const events = expandRecurringEventForRange(
      { ...thursdaySeries(movedThursdayOccurrence()), recurrenceEndDate: new Date("2025-11-06T00:00:00.000Z") },
      new Date("2025-11-07T06:00:00.000Z"),
      new Date("2025-11-08T05:59:59.999Z"),
      timeZone
    );
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("moved-occurrence");
  });

  it("honors a moved occurrence stored with a legacy pre-DST instance key", () => {
    const events = expandRecurringEventForRange(
      thursdaySeries(movedThursdayOccurrence({
        instanceId: makeInstanceId("series-1", "2025-11-06T14:00:00.000Z"),
      })),
      new Date("2025-11-07T06:00:00.000Z"),
      new Date("2025-11-08T05:59:59.999Z"),
      timeZone
    );
    expect(events).toHaveLength(1);
    expect(events[0].instanceStartTime).toBe("2025-11-06T15:00:00.000Z");
  });

  it("does not resurrect a deleted moved occurrence", () => {
    const events = expandRecurringEventForRange(
      thursdaySeries(movedThursdayOccurrence({ deleted: true })),
      new Date("2025-11-07T06:00:00.000Z"),
      new Date("2025-11-08T05:59:59.999Z"),
      timeZone
    );
    expect(events).toEqual([]);
  });

  it("keeps the next Thursday occurrence on its normal schedule", () => {
    const events = expandRecurringEventForRange(
      thursdaySeries(movedThursdayOccurrence()),
      new Date("2025-11-13T06:00:00.000Z"),
      new Date("2025-11-14T05:59:59.999Z"),
      timeZone
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "series-1",
      startTime: "2025-11-13T15:00:00.000Z",
    });
  });

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

  it("marks occurrences from a non-primary Google calendar as read-only", () => {
    const occurrences = expandRecurringEventForRange(
      baseSeries({ googleCalendarId: "shared-calendar@group.calendar.google.com" }),
      new Date("2025-11-01T05:00:00.000Z"),
      new Date("2025-11-30T05:59:59.999Z"),
      timeZone
    );

    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((event) => event.readOnly)).toBe(true);
  });

  it("keeps occurrences from the primary Google calendar editable", () => {
    for (const googleCalendarId of [null, "primary"]) {
      const occurrences = expandRecurringEventForRange(
        baseSeries({ googleCalendarId }),
        new Date("2025-11-01T05:00:00.000Z"),
        new Date("2025-11-30T05:59:59.999Z"),
        timeZone
      );

      expect(occurrences.length).toBeGreaterThan(0);
      expect(occurrences.every((event) => !event.readOnly)).toBe(true);
    }
  });
});
