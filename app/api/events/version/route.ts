import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendarForUser } from "@/lib/googleCalendar";
import { getOrSetInMemoryCache, getUserDataVersion } from "@/lib/inMemoryCache";

const VERSION_CACHE_TTL_MS = 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const cacheKey = `events-version:${userId}:${getUserDataVersion("events", userId)}`;
  const version = await getOrSetInMemoryCache(cacheKey, VERSION_CACHE_TTL_MS, async () => {
    await syncGoogleCalendarForUser(userId).catch((error) => {
      console.error("Google Calendar auto-sync failed", error);
    });

    const [latestEvent, eventCount] = await Promise.all([
      prisma.event.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.event.count({
        where: { userId },
      }),
    ]);

    const latestUpdatedAt = latestEvent?.updatedAt.toISOString() ?? "none";

    return [eventCount, latestUpdatedAt].join(":");
  });

  return NextResponse.json({ version }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
