import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ical, { ICalAlarmType } from "ical-generator";
import { RRule } from "rrule";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

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
  const toInclusiveDayEnd = (date: Date) => {
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  };

  const [standaloneEvents, seriesEvents] = await Promise.all([
    prisma.event.findMany({
      where: {
        userId: user.id,
        parentEventId: null,
        recurrenceRule: null,
        startTime: { lte: oneYearFromNow },
        endTime: { gte: oneMonthAgo },
      },
    }),
    prisma.event.findMany({
      where: {
        userId: user.id,
        parentEventId: null,
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
      // Parse the recurrence rule
      const rruleStr = `DTSTART:${event.startTime
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}\nRRULE:${event.recurrenceRule}`;

      const rule = RRule.fromString(rruleStr);

      // Create map of overrides by instanceId
      const overridesByInstanceId = new Map<
        string,
        (typeof event.childEvents)[number]
      >();
      for (const child of event.childEvents) {
        if (child.instanceId) {
          overridesByInstanceId.set(child.instanceId, child);
        }
      }

      // Generate occurrences for the 1-year window (respecting recurrenceEndDate)
      const recurrenceLimit = event.recurrenceEndDate
        ? toInclusiveDayEnd(event.recurrenceEndDate)
        : null;
      const occurrenceEnd =
        recurrenceLimit && recurrenceLimit < oneYearFromNow
          ? recurrenceLimit
          : oneYearFromNow;
      const occurrences =
        occurrenceEnd < oneMonthAgo
          ? []
          : rule.between(oneMonthAgo, occurrenceEnd, true);
      const durationMs = event.endTime.getTime() - event.startTime.getTime();

      for (const occ of occurrences) {
        const occStartIso = occ.toISOString();
        const instanceId = `${event.id}__${occStartIso}`;
        const override = overridesByInstanceId.get(instanceId);

        // If there's an override, use its values
        if (override) {
          const calEvent = calendar.createEvent({
            id: override.id,
            start: override.startTime,
            end: override.endTime,
            summary: override.title,
            description: override.description || undefined,
            url: override.link || undefined,
            allDay: override.allDay,
          });

          // Add reminder for override
          if (!override.reminderDisabled) {
            const reminderMinutes =
              override.reminderMinutes ?? user.defaultReminderMinutes;
            calEvent.createAlarm({
              type: ICalAlarmType.display,
              trigger: reminderMinutes * 60,
              description: `Reminder: ${override.title}`,
            });
          }
        } else {
          // Use the series event values
          const calEvent = calendar.createEvent({
            id: `${event.id}-${occStartIso}`,
            start: occ,
            end: new Date(occ.getTime() + durationMs),
            summary: event.title,
            description: event.description || undefined,
            url: event.link || undefined,
            allDay: event.allDay,
          });

          // Add reminder for series
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
