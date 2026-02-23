import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      calendarBackgroundUrl: true,
      calendarTopLeftUrl: true,
    },
  });

  return NextResponse.json({
    backgroundUrl: user?.calendarBackgroundUrl ?? null,
    topLeftUrl: user?.calendarTopLeftUrl ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { backgroundUrl, topLeftUrl } = body as {
    backgroundUrl?: string | null;
    topLeftUrl?: string | null;
  };

  const cleanBackground =
    typeof backgroundUrl === "string" && backgroundUrl.trim().length > 0
      ? backgroundUrl.trim().slice(0, 2048)
      : null;
  const cleanTopLeft =
    typeof topLeftUrl === "string" && topLeftUrl.trim().length > 0
      ? topLeftUrl.trim().slice(0, 2048)
      : null;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      calendarBackgroundUrl: cleanBackground,
      calendarTopLeftUrl: cleanTopLeft,
    },
    select: {
      calendarBackgroundUrl: true,
      calendarTopLeftUrl: true,
    },
  });

  return NextResponse.json({
    backgroundUrl: updated.calendarBackgroundUrl,
    topLeftUrl: updated.calendarTopLeftUrl,
  });
}

