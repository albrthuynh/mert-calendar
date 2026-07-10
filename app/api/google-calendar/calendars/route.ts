import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureGoogleCalendarWatches,
  getGoogleCalendarStatus,
  isGoogleCalendarSyncError,
  listAvailableGoogleCalendars,
  setGoogleCalendarSources,
  syncGoogleCalendarForUser,
} from "@/lib/googleCalendar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getGoogleCalendarStatus(session.user.id);
  if (!status.connected || !status.hasCalendarScope) {
    return NextResponse.json(
      { error: "Google Calendar permission is required." },
      { status: 409 }
    );
  }

  // Without the calendar-list scope we cannot enumerate the account's
  // calendars, but previously selected sources are still known locally.
  if (!status.hasCalendarListScope) {
    const sources = await prisma.googleCalendarSource.findMany({
      where: { userId: session.user.id },
      orderBy: { summary: "asc" },
    });
    return NextResponse.json({
      hasCalendarListScope: false,
      calendars: sources.map((source) => ({
        id: source.calendarId,
        summary: source.summary,
        primary: false,
        color: source.color,
        accessRole: null,
        selected: true,
      })),
    });
  }

  try {
    const calendars = await listAvailableGoogleCalendars(session.user.id);
    return NextResponse.json({ hasCalendarListScope: true, calendars });
  } catch (error) {
    const statusCode = isGoogleCalendarSyncError(error) ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list Google calendars.",
      },
      { status: statusCode }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getGoogleCalendarStatus(session.user.id);
  if (!status.connected || !status.hasCalendarScope) {
    return NextResponse.json(
      { error: "Google Calendar permission is required." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const calendarIds = body?.calendarIds;
  if (
    !Array.isArray(calendarIds) ||
    calendarIds.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { error: "calendarIds must be an array of calendar ids" },
      { status: 400 }
    );
  }

  try {
    const sources = await setGoogleCalendarSources(session.user.id, calendarIds);
    await syncGoogleCalendarForUser(session.user.id, { force: true });
    await ensureGoogleCalendarWatches(session.user.id).catch((error) => {
      console.error("Google Calendar watch setup failed", error);
    });

    return NextResponse.json({
      success: true,
      calendars: sources.map((source) => ({
        id: source.calendarId,
        summary: source.summary,
        color: source.color,
        lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    const statusCode = isGoogleCalendarSyncError(error) ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update Google calendars.",
      },
      { status: statusCode }
    );
  }
}
