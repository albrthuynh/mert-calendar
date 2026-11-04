import { publicErrorMessage } from "@/lib/security/logging";
import { logSecurityError } from "@/lib/security/logging";
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
    logSecurityError("Google Calendar webhook failed", error);
    return NextResponse.json(
      {
        error:
          publicErrorMessage(error, "Google Calendar webhook failed."),
      },
      { status }
    );
  }
}
