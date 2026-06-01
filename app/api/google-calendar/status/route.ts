import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleCalendarStatus } from "@/lib/googleCalendar";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getGoogleCalendarStatus(session.user.id);
  return NextResponse.json(status);
}
