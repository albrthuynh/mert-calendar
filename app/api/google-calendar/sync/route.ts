import { publicErrorMessage } from "@/lib/security/logging";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ensureGoogleCalendarWatches,
  getGoogleCalendarStatus,
  isGoogleCalendarSyncError,
  syncGoogleCalendarForUser,
  repairMertEventsInGoogle,
} from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getGoogleCalendarStatus(session.user.id);
  if (!status.connected || !status.hasCalendarScope || status.requiresReconnect) {
    return NextResponse.json(
      { error: "Reconnect Google Calendar to grant access and continue syncing.", requiresReconnect: true },
      { status: 409 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (!status.enabled) {
      await prisma.user.update({ where: { id: session.user.id }, data: { googleCalendarSyncEnabled: true } });
    }
    const repair = typeof body?.timeZone === "string"
      ? await repairMertEventsInGoogle(session.user.id, body.timeZone)
      : { repairedCount: 0 };
    const result = await syncGoogleCalendarForUser(session.user.id, { force: true, full: repair.repairedCount > 0 });
    const watch = await ensureGoogleCalendarWatches(session.user.id)
      .then((channel) => ({
        active: true,
        expiresAt: channel.expiration?.toISOString() ?? null,
      }))
      .catch((error) => ({
        active: false,
        error:
          publicErrorMessage(error, "Google Calendar webhook setup failed."),
      }));

    return NextResponse.json({ ...result, ...repair, watch });
  } catch (error) {
    const statusCode = isGoogleCalendarSyncError(error) ? error.status : 500;
    return NextResponse.json(
      {
        requiresReconnect: isGoogleCalendarSyncError(error) && error.requiresReconnect,
        error:
          publicErrorMessage(error, "Failed to sync Google Calendar."),
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
  await prisma.googleCalendarSource.updateMany({
    where: { userId: session.user.id },
    data: { syncToken: null, lastSyncedAt: null },
  });

  return NextResponse.json({ success: true });
}
