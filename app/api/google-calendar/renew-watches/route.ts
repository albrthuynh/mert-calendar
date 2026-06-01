import { NextRequest, NextResponse } from "next/server";
import { renewGoogleCalendarWatches } from "@/lib/googleCalendar";

function isAuthorized(req: NextRequest) {
  const secret = process.env.GOOGLE_CALENDAR_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await renewGoogleCalendarWatches();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
