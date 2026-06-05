import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendarForUser } from "@/lib/googleCalendar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncGoogleCalendarForUser(session.user.id).catch((error) => {
    console.error("Google Calendar auto-sync failed", error);
  });

  const [latestEvent, eventCount] = await Promise.all([
    prisma.event.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.event.count({
      where: { userId: session.user.id },
    }),
  ]);

  const latestUpdatedAt = latestEvent?.updatedAt.toISOString() ?? "none";

  return NextResponse.json({
    version: [eventCount, latestUpdatedAt].join(":"),
  });
}
