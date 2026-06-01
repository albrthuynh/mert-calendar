import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ensureGoogleCalendarWatch,
  getGoogleCalendarStatus,
  isGoogleCalendarSyncError,
  syncGoogleCalendarForUser,
} from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

export async function POST() {
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

  try {
    const result = await syncGoogleCalendarForUser(session.user.id, { force: true });
    const watch = await ensureGoogleCalendarWatch(session.user.id)
      .then((channel) => ({
        active: true,
        expiresAt: channel.expiration?.toISOString() ?? null,
      }))
      .catch((error) => ({
        active: false,
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar webhook setup failed.",
      }));

    return NextResponse.json({ ...result, watch });
  } catch (error) {
    const statusCode = isGoogleCalendarSyncError(error) ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync Google Calendar.",
      },
      { status: statusCode }
    );
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      googleCalendarSyncEnabled: false,
      googleCalendarSyncToken: null,
      googleCalendarLastSyncedAt: null,
    },
  });

  return NextResponse.json({ success: true });
}
