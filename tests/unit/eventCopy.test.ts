import { buildEventCopyPayload, parseDateInputValue } from "@/lib/eventCopy";
import { expandRecurringEventForRange, getSeriesEditTimes, truncateSeriesBeforeInstance } from "@/lib/recurringEvents";
import type { CalendarEvent } from "@/types/calendar";

const originalEvent: CalendarEvent = {
  id: "original-1", originalId: "original-1", title: "Class", description: "Bring notes", link: "https://example.com/meeting",
  startTime: new Date(2026, 9, 19, 11).toISOString(), endTime: new Date(2026, 9, 19, 12, 15).toISOString(),
  color: "#9C27B0", allDay: false, recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  recurrenceEndDate: "2026-12-10T00:00:00.000Z", reminderMinutes: 30, reminderDisabled: false,
  isRecurringInstance: true, instanceStartTime: new Date(2026, 9, 19, 11).toISOString(),
};

describe("exact, independent event copies", () => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  it("preserves every editable attribute without carrying source IDs or series links", () => {
    const copied = buildEventCopyPayload(originalEvent, new Date(2026, 9, 20));
    expect(copied).toEqual({
      title: originalEvent.title, description: originalEvent.description, link: originalEvent.link,
      startTime: new Date(2026, 9, 20, 11).toISOString(), endTime: new Date(2026, 9, 20, 12, 15).toISOString(),
      color: originalEvent.color, allDay: false, recurrenceRule: originalEvent.recurrenceRule,
      recurrenceEndDate: originalEvent.recurrenceEndDate, reminderMinutes: 30, reminderDisabled: false, timeZone,
    });
    expect(originalEvent.startTime).toBe(new Date(2026, 9, 19, 11).toISOString());
  });

  it("shows a Tuesday copy immediately and keeps the original Monday repeat rule", () => {
    const copied = buildEventCopyPayload(originalEvent, new Date(2026, 9, 20));
    const series = { ...copied, id: "independent-copy", startTime: new Date(copied.startTime), endTime: new Date(copied.endTime),
      recurrenceEndDate: new Date(copied.recurrenceEndDate!), childEvents: [] };
    const occurrences = expandRecurringEventForRange(series, new Date(2026, 9, 20), new Date(2026, 10, 1), timeZone);
    expect(occurrences.map((event) => new Date(event.startTime).getDate())).toEqual([20, 26]);
    expect(new Set(occurrences.map((event) => event.originalId))).toEqual(new Set(["independent-copy"]));
    const truncated = truncateSeriesBeforeInstance(series, new Date(2026, 9, 26, 11), timeZone);
    expect(expandRecurringEventForRange({ ...series, recurrenceRule: truncated.recurrenceRule }, new Date(2026, 9, 20), new Date(2026, 10, 1), timeZone))
      .toHaveLength(1);
  });

  it("supports moving and deleting only the copy's initial off-schedule occurrence", () => {
    const copied = buildEventCopyPayload(originalEvent, new Date(2026, 9, 20));
    const override = {
      ...copied, id: "copy-override", instanceId: `independent-copy__${copied.startTime}`,
      startTime: new Date(2026, 9, 21, 11), endTime: new Date(2026, 9, 21, 12, 15), deleted: false,
    };
    const series = { ...copied, id: "independent-copy", startTime: new Date(copied.startTime), endTime: new Date(copied.endTime),
      recurrenceEndDate: new Date(copied.recurrenceEndDate!), childEvents: [override] };
    const moved = expandRecurringEventForRange(series, new Date(2026, 9, 21), new Date(2026, 9, 22), timeZone);
    expect(moved).toHaveLength(1);
    expect(moved[0].id).toBe("copy-override");
    expect(expandRecurringEventForRange({ ...series, childEvents: [{ ...override, deleted: true }] },
      new Date(2026, 9, 20), new Date(2026, 9, 21), timeZone)).toEqual([]);
  });

  it.each(["FREQ=DAILY", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "FREQ=MONTHLY;BYMONTHDAY=19", "FREQ=WEEKLY;COUNT=4", "FREQ=WEEKLY;UNTIL=20261210T235959Z"])("preserves %s exactly", (rule) => {
    const copied = buildEventCopyPayload({ ...originalEvent, recurrenceRule: rule, recurrenceEndDate: null }, new Date(2026, 9, 20));
    expect(copied.recurrenceRule).toBe(rule);
    expect(copied.recurrenceEndDate).toBeNull();
  });

  it("preserves the end clock time of an overnight event across daylight saving changes", () => {
    const copied = buildEventCopyPayload({ ...originalEvent, recurrenceRule: null, recurrenceEndDate: null,
      startTime: new Date(2026, 9, 31, 23).toISOString(), endTime: new Date(2026, 10, 1, 3).toISOString(),
    }, new Date(2026, 10, 7));
    expect(new Date(copied.startTime)).toEqual(new Date(2026, 10, 7, 23));
    expect(new Date(copied.endTime)).toEqual(new Date(2026, 10, 8, 3));
  });

  it("preserves all-day dates and the exclusive end date", () => {
    const copied = buildEventCopyPayload({ ...originalEvent, allDay: true, recurrenceRule: null, recurrenceEndDate: null,
      startTime: "2026-10-19T00:00:00.000Z", endTime: "2026-10-21T00:00:00.000Z",
    }, new Date(2026, 10, 3));
    expect(copied.startTime).toBe("2026-11-03T00:00:00.000Z");
    expect(copied.endTime).toBe("2026-11-05T00:00:00.000Z");
  });

  it("rejects copying beyond the unchanged repeat end date instead of creating an invisible series", () => {
    expect(() => buildEventCopyPayload(originalEvent, new Date(2026, 11, 11))).toThrow("repeat end date");
    expect(() => buildEventCopyPayload({ ...originalEvent, recurrenceRule: "FREQ=DAILY;UNTIL=20261019T235959Z", recurrenceEndDate: null }, new Date(2026, 9, 21)))
      .toThrow("repeat schedule has no occurrences");
    expect(parseDateInputValue("2026-02-30")).toBeNull();
  });

  it("keeps the series anchor when editing a later occurrence across DST", () => {
    const series = { startTime: new Date("2026-10-20T16:00:00.000Z"), endTime: new Date("2026-10-20T17:00:00.000Z") };
    const unchanged = getSeriesEditTimes(series, new Date("2026-11-09T17:00:00.000Z"), new Date("2026-11-09T17:00:00.000Z"), new Date("2026-11-09T18:00:00.000Z"), "America/Chicago");
    expect(unchanged).toEqual(series);
    const shifted = getSeriesEditTimes(series, new Date("2026-11-09T17:00:00.000Z"), new Date("2026-11-09T18:00:00.000Z"), new Date("2026-11-09T19:00:00.000Z"), "America/Chicago");
    expect(shifted.startTime.toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
});
