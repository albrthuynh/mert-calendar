import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RRule } from "rrule";

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

  // Fetch events that could appear in the range:
  // - non-recurring events that overlap the range
  // - recurring events that started before rangeEnd (need to expand)
  const events = await prisma.event.findMany({
    where: {
      userId: session.user.id,
      OR: [
        // Non-recurring: overlap range
        {
          recurrenceRule: null,
          startTime: { lte: rangeEnd },
          endTime: { gte: rangeStart },
        },
        // Recurring: started before range end and either no end date or end date after range start
        {
          NOT: { recurrenceRule: null },
          startTime: { lte: rangeEnd },
          OR: [
            { recurrenceEndDate: null },
            { recurrenceEndDate: { gte: rangeStart } },
          ],
        },
      ],
    },
  });

  // Expand recurring events into occurrences within range
  const result: Array<{
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    color: string;
    allDay: boolean;
    recurrenceRule: string | null;
    recurrenceEndDate: string | null;
    isRecurringInstance: boolean;
    originalId: string;
  }> = [];

  for (const event of events) {
    if (!event.recurrenceRule) {
      result.push({
        ...event,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
        isRecurringInstance: false,
        originalId: event.id,
      });
      continue;
    }

    // Expand recurring event
    try {
      const durationMs =
        event.endTime.getTime() - event.startTime.getTime();

      const rruleStr = `DTSTART:${event.startTime
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}\nRRULE:${event.recurrenceRule}`;

      const rule = RRule.fromString(rruleStr);
      const occurrences = rule.between(rangeStart, rangeEnd, true);

      for (const occ of occurrences) {
        result.push({
          id: event.id,
          title: event.title,
          description: event.description,
          startTime: occ.toISOString(),
          endTime: new Date(occ.getTime() + durationMs).toISOString(),
          color: event.color,
          allDay: event.allDay,
          recurrenceRule: event.recurrenceRule,
          recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
          isRecurringInstance: true,
          originalId: event.id,
        });
      }
    } catch {
      // If rrule fails, fall back to showing original
      result.push({
        ...event,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
        isRecurringInstance: false,
        originalId: event.id,
      });
    }
  }

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
  } = body;

  if (!title || !startTime || !endTime) {
    return NextResponse.json(
      { error: "title, startTime, endTime are required" },
      { status: 400 }
    );
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
      userId: session.user.id,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
