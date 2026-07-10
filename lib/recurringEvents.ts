import { RRule } from "rrule";
import { isReadOnlyGoogleCalendarId } from "@/lib/googleCalendarReadOnly";

export type RecurringEventResponseItem = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  startTime: string;
  endTime: string;
  color: string;
  allDay: boolean;
  recurrenceRule: string | null;
  recurrenceEndDate: string | null;
  reminderMinutes: number | null;
  reminderDisabled: boolean;
  isRecurringInstance: boolean;
  originalId: string;
  instanceStartTime: string | null;
  /** True for events imported from a read-only Google calendar. */
  readOnly: boolean;
};

export type RecurringEventOverride = {
  id: string;
  instanceId: string | null;
  title: string;
  description: string | null;
  link: string | null;
  startTime: Date;
  endTime: Date;
  color: string;
  allDay: boolean;
  reminderMinutes: number | null;
  reminderDisabled: boolean;
  deleted: boolean;
};

export type RecurringEventSeries = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  startTime: Date;
  endTime: Date;
  color: string;
  allDay: boolean;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
  reminderMinutes: number | null;
  reminderDisabled: boolean;
  googleCalendarId?: string | null;
  childEvents: RecurringEventOverride[];
};

type WallDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function makeInstanceId(seriesId: string, instanceStartTimeIso: string) {
  return `${seriesId}__${instanceStartTimeIso}`;
}

function getDefaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function normalizeTimeZone(value: string | null) {
  const fallback = getDefaultTimeZone();
  if (!value) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

function getZonedFormatter(timeZone: string) {
  const cached = zonedFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedDateTimeParts(date: Date, timeZone: string): WallDateTimeParts {
  const values: Record<string, number> = {};

  for (const part of getZonedFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: values.fractionalSecond ?? 0,
  };
}

function wallPartsToDate(parts: WallDateTimeParts) {
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    )
  );
}

function dateToWallDate(date: Date, timeZone: string) {
  return wallPartsToDate(getZonedDateTimeParts(date, timeZone));
}

function wallDateToParts(date: Date): WallDateTimeParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  return wallPartsToDate(getZonedDateTimeParts(date, timeZone)).getTime() - date.getTime();
}

function wallPartsToUtcDate(parts: WallDateTimeParts, timeZone: string) {
  const wallMs = wallPartsToDate(parts).getTime();
  let utcMs = wallMs - getTimeZoneOffsetMs(new Date(wallMs), timeZone);
  const correctedUtcMs = wallMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (correctedUtcMs !== utcMs) {
    utcMs = correctedUtcMs;
  }
  return new Date(utcMs);
}

function recurrenceEndToWallDayEnd(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

function legacyOccurrenceStart(eventStart: Date, occurrenceWallDate: Date) {
  return new Date(
    Date.UTC(
      occurrenceWallDate.getUTCFullYear(),
      occurrenceWallDate.getUTCMonth(),
      occurrenceWallDate.getUTCDate(),
      eventStart.getUTCHours(),
      eventStart.getUTCMinutes(),
      eventStart.getUTCSeconds(),
      eventStart.getUTCMilliseconds()
    )
  );
}

export function expandRecurringEventForRange(
  event: RecurringEventSeries,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string
): RecurringEventResponseItem[] {
  const recurrenceRule = event.recurrenceRule;
  if (!recurrenceRule) return [];

  const readOnly = isReadOnlyGoogleCalendarId(event.googleCalendarId);

  const durationMs = event.endTime.getTime() - event.startTime.getTime();
  const recurrenceLimit = event.recurrenceEndDate
    ? recurrenceEndToWallDayEnd(event.recurrenceEndDate)
    : null;
  const wallRangeStart = dateToWallDate(rangeStart, timeZone);
  const wallRangeEnd = dateToWallDate(rangeEnd, timeZone);
  const occurrenceEnd =
    recurrenceLimit && recurrenceLimit < wallRangeEnd ? recurrenceLimit : wallRangeEnd;

  if (occurrenceEnd < wallRangeStart) {
    return [];
  }

  const rule = new RRule({
    ...RRule.parseString(recurrenceRule),
    dtstart: dateToWallDate(event.startTime, timeZone),
  });
  const occurrences = rule.between(wallRangeStart, occurrenceEnd, true);

  const overridesByInstanceId = new Map<string, RecurringEventOverride>();
  for (const child of event.childEvents) {
    if (child.instanceId) overridesByInstanceId.set(child.instanceId, child);
  }

  const result: RecurringEventResponseItem[] = [];

  for (const occ of occurrences) {
    const occStart = wallPartsToUtcDate(wallDateToParts(occ), timeZone);
    const occStartIso = occStart.toISOString();
    const instanceId = makeInstanceId(event.id, occStartIso);
    const legacyInstanceId = makeInstanceId(
      event.id,
      legacyOccurrenceStart(event.startTime, occ).toISOString()
    );
    const override =
      overridesByInstanceId.get(instanceId) ??
      overridesByInstanceId.get(legacyInstanceId);

    if (override) {
      if (override.deleted) {
        continue;
      }

      result.push({
        id: override.id,
        title: override.title,
        description: override.description,
        link: override.link,
        startTime: override.startTime.toISOString(),
        endTime: override.endTime.toISOString(),
        color: override.color,
        allDay: override.allDay,
        recurrenceRule,
        recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
        reminderMinutes: override.reminderMinutes ?? null,
        reminderDisabled: override.reminderDisabled ?? false,
        isRecurringInstance: true,
        originalId: event.id,
        instanceStartTime: occStartIso,
        readOnly,
      });
      continue;
    }

    result.push({
      id: event.id,
      title: event.title,
      description: event.description,
      link: event.link,
      startTime: occStartIso,
      endTime: new Date(occStart.getTime() + durationMs).toISOString(),
      color: event.color,
      allDay: event.allDay,
      recurrenceRule,
      recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
      reminderDisabled: event.reminderDisabled ?? false,
      isRecurringInstance: true,
      originalId: event.id,
      instanceStartTime: occStartIso,
      readOnly,
    });
  }

  return result;
}
