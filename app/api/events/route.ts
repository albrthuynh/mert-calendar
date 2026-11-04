import { loadEventsForRange } from "@/lib/eventRangeQueries";
import { CalendarWorkloadError } from "@/lib/security/workload";
import { logSecurityError } from "@/lib/security/logging";
import { invalidRange } from "@/lib/security/requestValidation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bumpUserDataVersion,
  getOrSetInMemoryCache,
} from "@/lib/inMemoryCache";
import { normalizeEventLink } from "@/lib/eventLink";
import {
  pushLocalEventToGoogle,
  syncGoogleCalendarForUser,
} from "@/lib/googleCalendar";
import {
  normalizeTimeZone,
  validateEventSchedule,
  type RecurringEventResponseItem,
} from "@/lib/recurringEvents";

const EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;

type EventResponseItem = RecurringEventResponseItem;

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
  if (invalidRange(rangeStart, rangeEnd)) {
    return NextResponse.json(
      { error: "start and end must be valid, ordered dates no more than 400 days apart" },
      { status: 400 }
    );
  }

  await syncGoogleCalendarForUser(session.user.id).catch((error) => {
    logSecurityError("Google Calendar auto-sync failed", error);
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { eventsRevision: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const version = user.eventsRevision.toString();
  const cacheKey = [
    "events",
    session.user.id,
    `v${version}`,
    timeZone,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  ].join(":");

  try {
    const result = await getOrSetInMemoryCache<EventResponseItem[]>(
      cacheKey, EVENTS_CACHE_TTL_MS,
      () => loadEventsForRange(session.user.id, rangeStart, rangeEnd, timeZone)
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CalendarWorkloadError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
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
    timeZone,
  } = body;

  if (!title || !startTime || !endTime) {
    return NextResponse.json(
      { error: "title, startTime, endTime are required" },
      { status: 400 }
    );
  }

  try {
    validateEventSchedule({
      startTime: new Date(startTime), endTime: new Date(endTime), allDay: allDay ?? false,
      recurrenceRule: recurrenceRule || null,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
    }, normalizeTimeZone(typeof timeZone === "string" ? timeZone : null));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid event schedule" }, { status: 400 });
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
      timeZone: normalizeTimeZone(typeof timeZone === "string" ? timeZone : null),
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
  await pushLocalEventToGoogle(session.user.id, event.id, { timeZone }).catch((error) => {
    logSecurityError("Google Calendar push failed", error);
  });
  bumpUserDataVersion("events", session.user.id);

  return NextResponse.json(event, { status: 201 });
}
