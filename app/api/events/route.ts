import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bumpUserDataVersion,
  getOrSetInMemoryCache,
  getUserDataVersion,
} from "@/lib/inMemoryCache";
import { normalizeEventLink } from "@/lib/eventLink";
import {
  pushLocalEventToGoogle,
  syncGoogleCalendarForUser,
} from "@/lib/googleCalendar";
import {
  expandRecurringEventForRange,
  normalizeTimeZone,
  type RecurringEventResponseItem,
} from "@/lib/recurringEvents";
import { isReadOnlyGoogleCalendarId } from "@/lib/googleCalendarReadOnly";

const EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;

type EventResponseItem = RecurringEventResponseItem;

async function loadEventsForRange(
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
      where: {
        userId,
        parentEventId: null,
        deleted: false,
        NOT: { recurrenceRule: null },
        startTime: { lte: rangeEnd },
        OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: rangeStart } }],
      },
      include: { childEvents: true },
    }),
  ]);

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

  for (const event of seriesEvents) {
    // Expand recurring event
    try {
      result.push(
        ...expandRecurringEventForRange(event, rangeStart, rangeEnd, timeZone)
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
  }

  return result;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const timeZone = normalizeTimeZone(searchParams.get("timeZone"));

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 }
    );
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return NextResponse.json(
      { error: "start and end must be valid ISO timestamps" },
      { status: 400 }
    );
  }

  await syncGoogleCalendarForUser(session.user.id).catch((error) => {
    console.error("Google Calendar auto-sync failed", error);
  });

  const version = getUserDataVersion("events", session.user.id);
  const cacheKey = [
    "events",
    session.user.id,
    `v${version}`,
    timeZone,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  ].join(":");

  const result = await getOrSetInMemoryCache<EventResponseItem[]>(
    cacheKey,
    EVENTS_CACHE_TTL_MS,
    () => loadEventsForRange(session.user.id, rangeStart, rangeEnd, timeZone)
  );

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!userExists) {
    return NextResponse.json(
      { error: "Session invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const {
    title,
    description,
    link,
    startTime,
    endTime,
    color,
    allDay,
    recurrenceRule,
    recurrenceEndDate,
    reminderMinutes,
    reminderDisabled,
  } = body;

  if (!title || !startTime || !endTime) {
    return NextResponse.json(
      { error: "title, startTime, endTime are required" },
      { status: 400 }
    );
  }

  const cleanReminderDisabled =
    typeof reminderDisabled === "boolean" ? reminderDisabled : false;
  const cleanReminderMinutes =
    reminderMinutes === null || reminderMinutes === undefined
      ? null
      : typeof reminderMinutes === "number" && Number.isFinite(reminderMinutes)
        ? Math.trunc(reminderMinutes)
        : NaN;
  if (cleanReminderMinutes !== null) {
    if (!Number.isFinite(cleanReminderMinutes) || cleanReminderMinutes < 0 || cleanReminderMinutes > 10080) {
      return NextResponse.json(
        { error: "reminderMinutes must be an integer between 0 and 10080, or null" },
        { status: 400 }
      );
    }
  }

  let cleanLink: string | null;
  try {
    cleanLink = normalizeEventLink(link) ?? null;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "link must be a valid URL" },
      { status: 400 }
    );
  }

  const event = await prisma.event.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      link: cleanLink,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      color: color ?? "#4285F4",
      allDay: allDay ?? false,
      recurrenceRule: recurrenceRule || null,
      recurrenceEndDate: recurrenceEndDate
        ? new Date(recurrenceEndDate)
        : null,
      reminderMinutes: cleanReminderMinutes,
      reminderDisabled: cleanReminderDisabled,
      userId: session.user.id,
    },
  });
  await pushLocalEventToGoogle(session.user.id, event.id).catch((error) => {
    console.error("Google Calendar push failed", error);
  });
  bumpUserDataVersion("events", session.user.id);

  return NextResponse.json(event, { status: 201 });
}
