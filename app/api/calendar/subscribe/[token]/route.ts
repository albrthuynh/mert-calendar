import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ical, { ICalAlarmType } from "ical-generator";
import { expandRecurringEventForRange, normalizeTimeZone } from "@/lib/recurringEvents";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  // Older subscription URLs have no zone; new URLs carry an IANA zone, not a fixed offset.
  const timeZone = normalizeTimeZone(req.nextUrl.searchParams.get("timeZone") ?? "UTC");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Find user by calendar subscription token
  const user = await prisma.user.findUnique({
    where: { calendarSubscriptionToken: token },
    select: {
      id: true,
      name: true,
      defaultReminderMinutes: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid subscription token" },
      { status: 404 }
    );
  }

  // Fetch all events for this user (we'll generate a 1-year window)
  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [standaloneEvents, seriesEvents] = await Promise.all([
    prisma.event.findMany({
      where: {
        userId: user.id,
        parentEventId: null,
        deleted: false,
        recurrenceRule: null,
        startTime: { lte: oneYearFromNow },
        endTime: { gte: oneMonthAgo },
      },
    }),
    prisma.event.findMany({
      where: {
        userId: user.id,
        parentEventId: null,
        deleted: false,
        NOT: { recurrenceRule: null },
        startTime: { lte: oneYearFromNow },
        OR: [
          { recurrenceEndDate: null },
          { recurrenceEndDate: { gte: oneMonthAgo } },
        ],
      },
      include: { childEvents: true },
    }),
  ]);

  // Create iCal calendar
  const calendar = ical({
    name: `${user.name ? `${user.name}'s` : "My"} Calendar`,
    prodId: {
      company: "Mert Calendar",
      product: "Calendar",
      language: "EN",
    },
    timezone: "UTC",
    // Suggest refresh every 1 hour (in ISO 8601 duration format)
    ttl: 3600,
  });

  // Add standalone events
  for (const event of standaloneEvents) {
    const calEvent = calendar.createEvent({
      id: event.id,
      start: event.startTime,
      end: event.endTime,
      summary: event.title,
      description: event.description || undefined,
      url: event.link || undefined,
      allDay: event.allDay,
    });

    // Add reminder if not disabled
    if (!event.reminderDisabled) {
      const reminderMinutes =
        event.reminderMinutes ?? user.defaultReminderMinutes;
      calEvent.createAlarm({
        type: ICalAlarmType.display,
        trigger: reminderMinutes * 60, // Convert minutes to seconds (negative = before)
        description: `Reminder: ${event.title}`,
      });
    }
  }

  // Add recurring events
  for (const event of seriesEvents) {
    try {
      const occurrences = expandRecurringEventForRange(
        event,
        oneMonthAgo,
        oneYearFromNow,
        event.allDay ? "UTC" : timeZone
      );

      for (const occurrence of occurrences) {
        const calEvent = calendar.createEvent({
          id: occurrence.id === event.id
            ? `${event.id}-${occurrence.instanceStartTime}`
            : occurrence.id,
          start: new Date(occurrence.startTime),
          end: new Date(occurrence.endTime),
          summary: occurrence.title,
          description: occurrence.description || undefined,
          url: occurrence.link || undefined,
          allDay: occurrence.allDay,
        });

        if (!occurrence.reminderDisabled) {
          const reminderMinutes =
            occurrence.reminderMinutes ?? user.defaultReminderMinutes;
          calEvent.createAlarm({
            type: ICalAlarmType.display,
            trigger: reminderMinutes * 60,
            description: `Reminder: ${occurrence.title}`,
          });
        }
      }
    } catch (error) {
      // If rrule parsing fails, fall back to showing the original event
      console.error(`Error parsing recurrence rule for event ${event.id}:`, error);
      const calEvent = calendar.createEvent({
        id: event.id,
        start: event.startTime,
        end: event.endTime,
        summary: event.title,
        description: event.description || undefined,
        url: event.link || undefined,
        allDay: event.allDay,
      });

      if (!event.reminderDisabled) {
        const reminderMinutes =
          event.reminderMinutes ?? user.defaultReminderMinutes;
        calEvent.createAlarm({
          type: ICalAlarmType.display,
          trigger: reminderMinutes * 60,
          description: `Reminder: ${event.title}`,
        });
      }
    }
  }

  // Generate the .ics file content
  const icsContent = calendar.toString();

  // Return with appropriate headers for calendar subscription
  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="calendar.ics"',
      // Cache for 1 hour to encourage updates
      "Cache-Control": "public, max-age=3600",
      // Additional headers for better compatibility
      "X-Published-TTL": "PT1H", // Suggest 1-hour refresh
    },
  });
}
