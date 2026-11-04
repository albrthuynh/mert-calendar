import { prisma } from "@/lib/prisma";
import { expandRecurringEventForRange, type RecurringEventResponseItem } from "@/lib/recurringEvents";
import { isReadOnlyGoogleCalendarId } from "@/lib/googleCalendarReadOnly";
import { CalendarWorkloadError, CalendarResponseBudget, MAX_SOURCE_EVENTS, MAX_OVERRIDE_EVENTS, MAX_EXPANDED_EVENTS } from "@/lib/security/workload";

type EventResponseItem = RecurringEventResponseItem;

export async function loadEventsForRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string
): Promise<EventResponseItem[]> {
  // Fetch base events:
  // - standalone non-recurring events that overlap the range (excluding per-instance overrides)
  // - recurring series events + their per-instance override children
  const [standaloneEvents, seriesEvents] = await Promise.all([
    prisma.event.findMany({
      take: MAX_SOURCE_EVENTS + 1,
      where: {
        userId,
        parentEventId: null,
        deleted: false,
        recurrenceRule: null,
        startTime: { lte: rangeEnd },
        endTime: { gte: rangeStart },
      },
    }),
    prisma.event.findMany({
      take: MAX_SOURCE_EVENTS + 1,
      where: {
        userId,
        parentEventId: null,
        deleted: false,
        NOT: { recurrenceRule: null },
        OR: [
          {
            startTime: { lte: rangeEnd },
            OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: rangeStart } }],
          },
          {
            childEvents: {
              some: {
                deleted: false,
                startTime: { lte: rangeEnd },
                endTime: { gt: rangeStart },
              },
            },
          },
        ],
      },

    }),
  ]);

  if (standaloneEvents.length + seriesEvents.length > MAX_SOURCE_EVENTS) throw new CalendarWorkloadError();

  // Legacy occurrence keys retain the series' original UTC hour across DST.
  const identityStart = new Date(rangeStart.getTime() - 2 * 86400000).toISOString();
  const identityEnd = new Date(rangeEnd.getTime() + 2 * 86400000).toISOString();
  const overrides = seriesEvents.length ? await prisma.event.findMany({
    take: MAX_OVERRIDE_EVENTS + 1,
    where: {
      userId,
      parentEventId: { in: seriesEvents.map((series) => series.id) },
      OR: [
        { startTime: { lte: rangeEnd }, endTime: { gt: rangeStart } },
        ...seriesEvents.map((series) => ({ instanceId: {
          gte: `${series.id}__${identityStart}`,
          lte: `${series.id}__${identityEnd}`,
        } })),
      ],
    },
  }) : [];
  if (overrides.length > MAX_OVERRIDE_EVENTS) throw new CalendarWorkloadError();
  const overridesByParent = new Map<string, typeof overrides>();
  for (const override of overrides) {
    if (!override.parentEventId) continue;
    const children = overridesByParent.get(override.parentEventId) ?? [];
    children.push(override);
    overridesByParent.set(override.parentEventId, children);
  }

  // Expand recurring events into occurrences within range
  const result: EventResponseItem[] = [];

  for (const event of standaloneEvents) {
    result.push({
      ...event,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
      reminderDisabled: event.reminderDisabled ?? false,
      isRecurringInstance: false,
      originalId: event.id,
      instanceStartTime: null,
      readOnly: isReadOnlyGoogleCalendarId(event.googleCalendarId),
    });
  }

  const outputBudget = new CalendarResponseBudget();
  outputBudget.consume(result);
  for (const event of seriesEvents) {
    const previousResultCount = result.length;
    if (result.length > MAX_EXPANDED_EVENTS) throw new CalendarWorkloadError();
    // Expand recurring event
    try {
      result.push(
        ...expandRecurringEventForRange({ ...event, childEvents: overridesByParent.get(event.id) ?? [] }, rangeStart, rangeEnd, timeZone)
      );
    } catch {
      // If rrule fails, fall back to showing original
      result.push({
        ...event,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
        reminderMinutes: event.reminderMinutes ?? null,
        reminderDisabled: event.reminderDisabled ?? false,
        isRecurringInstance: false,
        originalId: event.id,
        instanceStartTime: null,
        readOnly: isReadOnlyGoogleCalendarId(event.googleCalendarId),
      });
    }
    outputBudget.consume(result.slice(previousResultCount));
  }

  if (result.length > MAX_EXPANDED_EVENTS) throw new CalendarWorkloadError();
  return result;
}

