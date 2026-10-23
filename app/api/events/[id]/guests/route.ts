import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleEventGuests, inviteGoogleEventGuests, isGoogleCalendarSyncError } from "@/lib/googleCalendar";
import { normalizeGuestEmails, type EventGuestScope } from "@/lib/eventGuests";

function guestErrorResponse(error: unknown) {
  return NextResponse.json({
    error: error instanceof Error ? error.message : "Could not access the event's guests.",
    requiresReconnect: isGoogleCalendarSyncError(error) && error.requiresReconnect,
  }, { status: isGoogleCalendarSyncError(error) ? error.status : 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = request.nextUrl.searchParams.get("scope") ?? "event";
  if (scope !== "event" && scope !== "series") return NextResponse.json({ error: "Invalid invitation scope." }, { status: 400 });
  const { id } = await params;
  try {
    const guests = await getGoogleEventGuests(session.user.id, id, {
      scope,
      instanceStartTime: request.nextUrl.searchParams.get("instanceStartTime") ?? undefined,
    });
    return NextResponse.json({ guests }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return guestErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || (body.scope !== "event" && body.scope !== "series") ||
    (body.instanceStartTime !== undefined && typeof body.instanceStartTime !== "string")) {
    return NextResponse.json({ error: "Choose a valid invitation scope." }, { status: 400 });
  }
  let emails: string[];
  try {
    emails = normalizeGuestEmails(body.emails);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid guest emails." }, { status: 400 });
  }
  const { id } = await params;
  try {
    return NextResponse.json(await inviteGoogleEventGuests(session.user.id, id, emails, {
      scope: body.scope as EventGuestScope,
      instanceStartTime: body.instanceStartTime,
    }));
  } catch (error) {
    return guestErrorResponse(error);
  }
}
