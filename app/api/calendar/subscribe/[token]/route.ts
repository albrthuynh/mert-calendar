import { loadEventsForRange } from "@/lib/eventRangeQueries";
import { CalendarWorkloadError } from "@/lib/security/workload";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ical, { ICalAlarmType } from "ical-generator";
import { normalizeTimeZone } from "@/lib/recurringEvents";

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
    where: { calendarSubscriptionToken: token, disabledAt: null },
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

  const now = new Date();
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let events;
  try {
    events = await loadEventsForRange(user.id, oneMonthAgo, oneYearFromNow, timeZone);
  } catch (error) {
    if (error instanceof CalendarWorkloadError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }

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

  for (const event of events) {
    const calEvent = calendar.createEvent({
      id: event.isRecurringInstance && event.id === event.originalId
        ? `${event.id}-${event.instanceStartTime}` : event.id,
      start: new Date(event.startTime),
      end: new Date(event.endTime),
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
        trigger: reminderMinutes * 60, // Convert minutes to seconds (negative = before)
        description: `Reminder: ${event.title}`,
      });
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
      // The URL grants access to private events and can be revoked by rotating its token.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      // Additional headers for better compatibility
      "X-Published-TTL": "PT1H", // Suggest 1-hour refresh
    },
  });
}
