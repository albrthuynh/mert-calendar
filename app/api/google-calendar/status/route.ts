import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkGoogleCalendarConnection, isGoogleCalendarSyncError } from "@/lib/googleCalendar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await checkGoogleCalendarConnection(session.user.id);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check Google Calendar connection." },
      { status: isGoogleCalendarSyncError(error) ? error.status : 500 }
    );
  }
}
