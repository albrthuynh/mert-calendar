import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { renewGoogleCalendarWatches } from "@/lib/googleCalendar";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.GOOGLE_CALENDAR_CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authHeader ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400000) } } });
  await prisma.securityLease.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.session.deleteMany({ where: { expires: { lt: new Date() } } });
  const result = await renewGoogleCalendarWatches();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
