import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n < min || n > max) return null;
  return n;
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      notificationsEnabled: true,
      defaultReminderMinutes: true,
      notificationSoundEnabled: true,
      notificationSound: true,
      notificationVolume: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Session invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    notificationsEnabled: user.notificationsEnabled,
    defaultReminderMinutes: user.defaultReminderMinutes,
    notificationSoundEnabled: user.notificationSoundEnabled,
    notificationSound: user.notificationSound ?? null,
    notificationVolume: user.notificationVolume,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;

  const notificationsEnabled =
    typeof body.notificationsEnabled === "boolean"
      ? body.notificationsEnabled
      : undefined;
  const notificationSoundEnabled =
    typeof body.notificationSoundEnabled === "boolean"
      ? body.notificationSoundEnabled
      : undefined;

  let defaultReminderMinutesClean: number | undefined;
  if (body.defaultReminderMinutes !== undefined) {
    const v = clampInt(body.defaultReminderMinutes, 0, 60 * 24 * 7); // up to 7 days
    if (v === null) {
      return NextResponse.json(
        { error: "defaultReminderMinutes must be an integer between 0 and 10080" },
        { status: 400 }
      );
    }
    defaultReminderMinutesClean = v;
  }

  let notificationVolumeClean: number | undefined;
  if (body.notificationVolume !== undefined) {
    const v = clampInt(body.notificationVolume, 0, 100);
    if (v === null) {
      return NextResponse.json(
        { error: "notificationVolume must be an integer between 0 and 100" },
        { status: 400 }
      );
    }
    notificationVolumeClean = v;
  }

  const notificationSoundRaw = body.notificationSound as unknown;
  if (body.notificationSound !== undefined && !isStringOrNull(notificationSoundRaw)) {
    return NextResponse.json(
      { error: "notificationSound must be a string or null" },
      { status: 400 }
    );
  }

  const cleanSound =
    typeof notificationSoundRaw === "string" && notificationSoundRaw.trim().length > 0
      ? notificationSoundRaw.trim().slice(0, 64)
      : null;

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

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(notificationsEnabled !== undefined && { notificationsEnabled }),
      ...(defaultReminderMinutesClean !== undefined && {
        defaultReminderMinutes: defaultReminderMinutesClean,
      }),
      ...(notificationSoundEnabled !== undefined && { notificationSoundEnabled }),
      ...(body.notificationSound !== undefined && { notificationSound: cleanSound }),
      ...(notificationVolumeClean !== undefined && { notificationVolume: notificationVolumeClean }),
    },
    select: {
      notificationsEnabled: true,
      defaultReminderMinutes: true,
      notificationSoundEnabled: true,
      notificationSound: true,
      notificationVolume: true,
    },
  });

  return NextResponse.json({
    notificationsEnabled: updated.notificationsEnabled,
    defaultReminderMinutes: updated.defaultReminderMinutes,
    notificationSoundEnabled: updated.notificationSoundEnabled,
    notificationSound: updated.notificationSound ?? null,
    notificationVolume: updated.notificationVolume,
  });
}

