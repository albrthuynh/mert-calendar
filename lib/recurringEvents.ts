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

export function recurrenceEndToUtcDayEnd(date: Date, timeZone: string) {
  return wallPartsToUtcDate(wallDateToParts(recurrenceEndToWallDayEnd(date)), timeZone);
}

export function validateEventSchedule(event: {
  startTime: Date;
  endTime: Date;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
  allDay?: boolean;
}, timeZone: string) {
  if (!Number.isFinite(event.startTime.getTime()) || !Number.isFinite(event.endTime.getTime())) {
    throw new Error("Start and end must be valid dates.");
  }
  if (event.endTime <= event.startTime) throw new Error("End time must be after start time.");
  if (!event.recurrenceRule) return;
  const wallStart = event.allDay ? event.startTime : dateToWallDate(event.startTime, timeZone);
  if (event.recurrenceEndDate) {
    if (!Number.isFinite(event.recurrenceEndDate.getTime())) throw new Error("Choose a valid repeat end date.");
    if (recurrenceEndToWallDayEnd(event.recurrenceEndDate) < wallStart) {
      throw new Error("The repeat end date must be on or after the event's start date.");
    }
  }
  let recurrence: RRule;
  try {
    const options = RRule.parseString(event.recurrenceRule);
    if (options.freq === undefined) throw new Error("Missing frequency");
    if (options.count !== undefined && options.count !== null && (!Number.isInteger(options.count) || options.count <= 0)) {
      throw new Error("Invalid count");
    }
    recurrence = new RRule({ ...options, dtstart: wallStart });
  } catch {
    throw new Error("Choose a valid repeat schedule.");
  }
  const until = recurrence.options.until;
  if (until && until < wallStart) {
    throw new Error("This repeat schedule has no occurrences on or after the event's start date. Choose a later repeat end date.");
  }
}

export function eventStartMatchesRecurrence(rule: string, startTime: Date, timeZone: string) {
  const wallStart = dateToWallDate(startTime, timeZone);
  const recurrence = new RRule({ ...RRule.parseString(rule), dtstart: wallStart });
  return recurrence.after(wallStart, true)?.getTime() === wallStart.getTime();
}

export function getLastRecurrenceStartBeforeDate(rule: string, startTime: Date, endDate: Date, timeZone: string) {
  const recurrence = new RRule({ ...RRule.parseString(rule), dtstart: dateToWallDate(startTime, timeZone) });
  const lastWallStart = recurrence.before(recurrenceEndToWallDayEnd(endDate), true);
  return lastWallStart ? wallPartsToUtcDate(wallDateToParts(lastWallStart), timeZone) : null;
}

export function getSeriesEditTimes(
  series: Pick<RecurringEventSeries, "startTime" | "endTime">,
  instanceStart: Date,
  editedStart: Date,
  editedEnd: Date,
  timeZone: string
) {
  if (!Number.isFinite(instanceStart.getTime())) throw new Error("Choose a valid series occurrence.");
  const wallTimeShift = dateToWallDate(editedStart, timeZone).getTime() - dateToWallDate(instanceStart, timeZone).getTime();
  const shiftedWallStart = new Date(dateToWallDate(series.startTime, timeZone).getTime() + wallTimeShift);
  const startTime = wallPartsToUtcDate(wallDateToParts(shiftedWallStart), timeZone);
  return { startTime, endTime: new Date(startTime.getTime() + editedEnd.getTime() - editedStart.getTime()) };
}

export function truncateSeriesBeforeInstance(
  event: Pick<RecurringEventSeries, "id" | "startTime" | "recurrenceRule" | "recurrenceEndDate">,
  instanceStart: Date,
  timeZone: string
) {
  if (!event.recurrenceRule || Number.isNaN(instanceStart.getTime())) {
    throw new Error("A recurring series and valid occurrence timestamp are required.");
  }
  const rule = new RRule({
    ...RRule.parseString(event.recurrenceRule),
    dtstart: dateToWallDate(event.startTime, timeZone),
  });
  if (instanceStart.getTime() === event.startTime.getTime()) {
    return { recurrenceRule: null, instanceStartTime: event.startTime, legacyInstanceId: makeInstanceId(event.id, event.startTime.toISOString()) };
  }
  const selectedInstanceId = makeInstanceId(event.id, instanceStart.toISOString());
  const searchEnd = dateToWallDate(new Date(instanceStart.getTime() + 24 * 60 * 60 * 1000), timeZone);
  const recurrenceLimit = event.recurrenceEndDate
    ? recurrenceEndToWallDayEnd(event.recurrenceEndDate)
    : null;
  let precedingCount = 0;
  let selectedIdentity: ReturnType<typeof getOccurrenceIdentity> | undefined;
  rule.all((occurrence) => {
    if (occurrence > searchEnd || (recurrenceLimit && occurrence > recurrenceLimit)) return false;
    const identity = getOccurrenceIdentity(event, occurrence, timeZone);
    if (identity.instanceId === selectedInstanceId || identity.legacyInstanceId === selectedInstanceId) {
      selectedIdentity = identity;
      return false;
    }
    precedingCount += 1;
    return true;
  });
  if (!selectedIdentity) throw new Error("The selected occurrence does not belong to this series.");

  // COUNT preserves the exact boundary across time zones, DST, and multiple events per day.
  const ruleParts = event.recurrenceRule.split(";").filter(
    (part) => !part.startsWith("UNTIL=") && !part.startsWith("COUNT=")
  );
  ruleParts.push(`COUNT=${precedingCount}`);
  return {
    recurrenceRule: precedingCount === 0 ? "FREQ=DAILY;COUNT=1" : ruleParts.join(";"),
    instanceStartTime: selectedIdentity.startTime,
    legacyInstanceId: selectedIdentity.legacyInstanceId,
  };
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

function getOccurrenceIdentity(
  event: Pick<RecurringEventSeries, "id" | "startTime">,
  occurrenceWallDate: Date,
  timeZone: string
) {
  const startTime = wallPartsToUtcDate(wallDateToParts(occurrenceWallDate), timeZone);
  const startTimeIso = startTime.toISOString();
  return {
    startTime,
    startTimeIso,
    instanceId: makeInstanceId(event.id, startTimeIso),
    legacyInstanceId: makeInstanceId(
      event.id,
      legacyOccurrenceStart(event.startTime, occurrenceWallDate).toISOString()
    ),
  };
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

  const rule = new RRule({
    ...RRule.parseString(recurrenceRule),
    dtstart: dateToWallDate(event.startTime, timeZone),
  });
  const occurrences = occurrenceEnd < wallRangeStart
    ? []
    : rule.between(wallRangeStart, occurrenceEnd, true);
  const occurrenceWallTimes = new Set(occurrences.map((occurrence) => occurrence.getTime()));
  const wallSeriesStart = dateToWallDate(event.startTime, timeZone);
  // The chosen start is an occurrence even when a copied rule names other weekdays.
  if (
    wallSeriesStart >= wallRangeStart && wallSeriesStart <= occurrenceEnd &&
    (!rule.options.until || wallSeriesStart <= rule.options.until) &&
    !occurrenceWallTimes.has(wallSeriesStart.getTime())
  ) {
    occurrences.unshift(wallSeriesStart);
    occurrenceWallTimes.add(wallSeriesStart.getTime());
  }

  // A day request may exclude the original date of an occurrence moved into that day.
  // Resolve its original rule occurrence so week/day results retain the same identity.
  for (const override of event.childEvents) {
    if (
      override.deleted ||
      !override.instanceId?.startsWith(`${event.id}__`) ||
      override.startTime > rangeEnd ||
      override.endTime <= rangeStart
    ) {
      continue;
    }

    const originalStart = new Date(override.instanceId.slice(event.id.length + 2));
    if (Number.isNaN(originalStart.getTime())) continue;
    const originalWallTime = dateToWallDate(originalStart, timeZone).getTime();
    // Legacy UTC-based keys can differ from the actual occurrence after DST changes.
    const lookupWindowMs = 24 * 60 * 60 * 1000;
    const candidates = rule.between(
      new Date(originalWallTime - lookupWindowMs),
      new Date(originalWallTime + lookupWindowMs),
      true
    );
    if (wallSeriesStart >= new Date(originalWallTime - lookupWindowMs) && wallSeriesStart <= new Date(originalWallTime + lookupWindowMs)) {
      candidates.push(wallSeriesStart);
    }
    for (const candidate of candidates) {
      if (recurrenceLimit && candidate > recurrenceLimit) continue;
      const { instanceId, legacyInstanceId } = getOccurrenceIdentity(event, candidate, timeZone);
      if (override.instanceId !== instanceId && override.instanceId !== legacyInstanceId) continue;
      if (!occurrenceWallTimes.has(candidate.getTime())) {
        occurrences.push(candidate);
        occurrenceWallTimes.add(candidate.getTime());
      }
      break;
    }
  }

  const overridesByInstanceId = new Map<string, RecurringEventOverride>();
  for (const child of event.childEvents) {
    if (child.instanceId) overridesByInstanceId.set(child.instanceId, child);
  }

  const result: RecurringEventResponseItem[] = [];

  for (const occurrence of occurrences) {
    const {
      startTime: occurrenceStart,
      startTimeIso: occurrenceStartIso,
      instanceId,
      legacyInstanceId,
    } = getOccurrenceIdentity(event, occurrence, timeZone);
    const override =
      overridesByInstanceId.get(instanceId) ??
      overridesByInstanceId.get(legacyInstanceId);

    if (override) {
      if (
        override.deleted ||
        override.startTime > rangeEnd ||
        override.endTime <= rangeStart
      ) {
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
        instanceStartTime: occurrenceStartIso,
        readOnly,
      });
      continue;
    }

    result.push({
      id: event.id,
      title: event.title,
      description: event.description,
      link: event.link,
      startTime: occurrenceStartIso,
      endTime: new Date(occurrenceStart.getTime() + durationMs).toISOString(),
      color: event.color,
      allDay: event.allDay,
      recurrenceRule,
      recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
      reminderDisabled: event.reminderDisabled ?? false,
      isRecurringInstance: true,
      originalId: event.id,
      instanceStartTime: occurrenceStartIso,
      readOnly,
    });
  }

  return result;
}
