import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bumpUserDataVersion,
  getOrSetInMemoryCache,
  getUserDataVersion,
} from "@/lib/inMemoryCache";
import { RRule } from "rrule";

const EVENTS_CACHE_TTL_MS = 2 * 60 * 1000;

type EventResponseItem = {
  id: string;
  title: string;
  description: string | null;
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
};

function makeInstanceId(seriesId: string, instanceStartTimeIso: string) {
  return `${seriesId}__${instanceStartTimeIso}`;
}

function toInclusiveDayEnd(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

async function loadEventsForRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<EventResponseItem[]> {
  // Fetch base events:
  // - standalone non-recurring events that overlap the range (excluding per-instance overrides)
  // - recurring series events + their per-instance override children
  const [standaloneEvents, seriesEvents] = await Promise.all([
    prisma.event.findMany({
      where: {
        userId,
        parentEventId: null,
        recurrenceRule: null,
        startTime: { lte: rangeEnd },
        endTime: { gte: rangeStart },
      },
    }),
    prisma.event.findMany({
      where: {
        userId,
        parentEventId: null,
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
    });
  }

  for (const event of seriesEvents) {
    // Expand recurring event
    try {
      const durationMs = event.endTime.getTime() - event.startTime.getTime();
      const recurrenceLimit = event.recurrenceEndDate
        ? toInclusiveDayEnd(event.recurrenceEndDate)
        : null;
      const occurrenceEnd =
        recurrenceLimit && recurrenceLimit < rangeEnd ? recurrenceLimit : rangeEnd;

      if (occurrenceEnd < rangeStart) {
        continue;
      }

      const rruleStr = `DTSTART:${event.startTime
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}\nRRULE:${event.recurrenceRule}`;

      const rule = RRule.fromString(rruleStr);
      const occurrences = rule.between(rangeStart, occurrenceEnd, true);

      const overridesByInstanceId = new Map<string, (typeof event.childEvents)[number]>();
      for (const child of event.childEvents) {
        if (child.instanceId) overridesByInstanceId.set(child.instanceId, child);
      }

      for (const occ of occurrences) {
        const occStartIso = occ.toISOString();
        const instanceId = makeInstanceId(event.id, occStartIso);
        const override = overridesByInstanceId.get(instanceId);

        if (override) {
          result.push({
            id: override.id,
            title: override.title,
            description: override.description,
            startTime: override.startTime.toISOString(),
            endTime: override.endTime.toISOString(),
            color: override.color,
            allDay: override.allDay,
            recurrenceRule: event.recurrenceRule,
            recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
            reminderMinutes: override.reminderMinutes ?? null,
            reminderDisabled: override.reminderDisabled ?? false,
            isRecurringInstance: true,
            originalId: event.id,
            instanceStartTime: occStartIso,
          });
          continue;
        }

        result.push({
          id: event.id,
          title: event.title,
          description: event.description,
          startTime: occStartIso,
          endTime: new Date(occ.getTime() + durationMs).toISOString(),
          color: event.color,
          allDay: event.allDay,
          recurrenceRule: event.recurrenceRule,
          recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
          reminderMinutes: event.reminderMinutes ?? null,
          reminderDisabled: event.reminderDisabled ?? false,
          isRecurringInstance: true,
          originalId: event.id,
          instanceStartTime: occStartIso,
        });
      }
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

  const version = getUserDataVersion("events", session.user.id);
  const cacheKey = [
    "events",
    session.user.id,
    `v${version}`,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  ].join(":");

  const result = await getOrSetInMemoryCache<EventResponseItem[]>(
    cacheKey,
    EVENTS_CACHE_TTL_MS,
    () => loadEventsForRange(session.user.id, rangeStart, rangeEnd)
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

  const event = await prisma.event.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
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
  bumpUserDataVersion("events", session.user.id);

  return NextResponse.json(event, { status: 201 });
}
