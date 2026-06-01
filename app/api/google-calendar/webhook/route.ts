import { NextRequest, NextResponse } from "next/server";
import {
  handleGoogleCalendarWebhook,
  isGoogleCalendarSyncError,
} from "@/lib/googleCalendar";

export async function POST(req: NextRequest) {
  try {
    await handleGoogleCalendarWebhook(req.headers);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = isGoogleCalendarSyncError(error) ? error.status : 500;
    console.error("Google Calendar webhook failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar webhook failed.",
      },
      { status }
    );
  }
}
