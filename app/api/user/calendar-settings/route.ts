import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeCalendarColor, normalizeCalendarImageUrl } from "@/lib/calendarAppearance";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      calendarColor: true,
      calendarBackgroundUrl: true,
      calendarTopLeftUrl: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Session invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    calendarColor: user.calendarColor ?? null,
    backgroundUrl: user.calendarBackgroundUrl ?? null,
    topLeftUrl: user.calendarTopLeftUrl ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  let cleanColor: string | null | undefined;
  let cleanBackground: string | null | undefined;
  let cleanTopLeft: string | null | undefined;
  try {
    cleanColor = normalizeCalendarColor(body.calendarColor);
    cleanBackground = normalizeCalendarImageUrl(body.backgroundUrl);
    cleanTopLeft = normalizeCalendarImageUrl(body.topLeftUrl);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
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

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      calendarColor: cleanColor,
      calendarBackgroundUrl: cleanBackground,
      calendarTopLeftUrl: cleanTopLeft,
    },
    select: {
      calendarColor: true,
      calendarBackgroundUrl: true,
      calendarTopLeftUrl: true,
    },
  });

  return NextResponse.json({
    calendarColor: updated.calendarColor,
    backgroundUrl: updated.calendarBackgroundUrl,
    topLeftUrl: updated.calendarTopLeftUrl,
  });
}

