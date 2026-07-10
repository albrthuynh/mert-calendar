import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpUserDataVersion } from "@/lib/inMemoryCache";
import { normalizeEventLink } from "@/lib/eventLink";
import {
  deleteLocalEventFromGoogle,
  pushLocalEventToGoogle,
} from "@/lib/googleCalendar";
import { isReadOnlyGoogleCalendarId } from "@/lib/googleCalendarReadOnly";

function makeInstanceId(seriesId: string, instanceStartTimeIso: string) {
  return `${seriesId}__${instanceStartTimeIso}`;
}

function readOnlyEventResponse() {
  return NextResponse.json(
    { error: "This event comes from a read-only Google calendar." },
    { status: 403 }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(event);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    title,
    description,
    link,
    startTime,
    endTime,
    color,
    allDay,
    recurrenceRule,
    recurrenceEndDate,
    reminderMinutes,
    reminderDisabled,
    editScope,
    instanceStartTime,
  } = body;

  const existing = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isReadOnlyGoogleCalendarId(existing.googleCalendarId)) {
    return readOnlyEventResponse();
  }

  // Editing a single occurrence of a recurring series:
  // Create/update a child override event keyed by (seriesId + instanceStartTime).
  if (editScope === "single") {
    if (!existing.recurrenceRule) {
      return NextResponse.json(
        { error: "editScope=single is only supported for recurring events" },
        { status: 400 }
      );
    }
    if (!instanceStartTime) {
      return NextResponse.json(
        { error: "instanceStartTime is required when editScope=single" },
        { status: 400 }
      );
    }
    const instanceStart = new Date(instanceStartTime);
    if (Number.isNaN(instanceStart.getTime())) {
      return NextResponse.json(
        { error: "instanceStartTime must be a valid ISO timestamp" },
        { status: 400 }
      );
    }
    const instanceStartIso = instanceStart.toISOString();
    const instanceId = makeInstanceId(existing.id, instanceStartIso);
    const seriesDurationMs = existing.endTime.getTime() - existing.startTime.getTime();

    const cleanReminderDisabled =
      reminderDisabled === undefined
        ? undefined
        : typeof reminderDisabled === "boolean"
          ? reminderDisabled
          : null;
    if (cleanReminderDisabled === null) {
      return NextResponse.json(
        { error: "reminderDisabled must be a boolean" },
        { status: 400 }
      );
    }

    const cleanReminderMinutes =
      reminderMinutes === undefined
        ? undefined
        : reminderMinutes === null
          ? null
          : typeof reminderMinutes === "number" && Number.isFinite(reminderMinutes)
            ? Math.trunc(reminderMinutes)
            : NaN;
    if (cleanReminderMinutes !== undefined && cleanReminderMinutes !== null) {
      if (
        !Number.isFinite(cleanReminderMinutes) ||
        cleanReminderMinutes < 0 ||
        cleanReminderMinutes > 10080
      ) {
        return NextResponse.json(
          { error: "reminderMinutes must be an integer between 0 and 10080, or null" },
          { status: 400 }
        );
      }
    }

    let cleanLink: string | null | undefined;
    try {
      cleanLink = normalizeEventLink(link);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "link must be a valid URL" },
        { status: 400 }
      );
    }

    const override = await prisma.event.upsert({
      where: { instanceId },
      update: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(cleanLink !== undefined && { link: cleanLink }),
        ...(startTime !== undefined && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: new Date(endTime) }),
        ...(color !== undefined && { color }),
        ...(allDay !== undefined && { allDay }),
        ...(cleanReminderMinutes !== undefined && { reminderMinutes: cleanReminderMinutes }),
        ...(cleanReminderDisabled !== undefined && { reminderDisabled: cleanReminderDisabled }),
        // A per-instance override is always non-recurring.
        recurrenceRule: null,
        recurrenceEndDate: null,
        deleted: false,
      },
      create: {
        instanceId,
        parentEventId: existing.id,
        userId: session.user.id,
        title: typeof title === "string" ? title.trim() : existing.title,
        description:
          description === undefined ? existing.description : description?.trim() || null,
        link: cleanLink === undefined ? existing.link : cleanLink,
        startTime: startTime ? new Date(startTime) : new Date(instanceStartIso),
        endTime: endTime
          ? new Date(endTime)
          : new Date(new Date(instanceStartIso).getTime() + seriesDurationMs),
        color: color ?? existing.color,
        allDay: allDay ?? existing.allDay,
        recurrenceRule: null,
        recurrenceEndDate: null,
        deleted: false,
        reminderMinutes:
          cleanReminderMinutes === undefined ? (existing.reminderMinutes ?? null) : cleanReminderMinutes,
        reminderDisabled:
          cleanReminderDisabled === undefined ? (existing.reminderDisabled ?? false) : cleanReminderDisabled,
      },
    });
    await pushLocalEventToGoogle(session.user.id, override.id).catch((error) => {
      console.error("Google Calendar push failed", error);
    });
    bumpUserDataVersion("events", session.user.id);

    return NextResponse.json(override);
  }

  const cleanReminderDisabled =
    reminderDisabled === undefined
      ? undefined
      : typeof reminderDisabled === "boolean"
        ? reminderDisabled
        : null;
  if (cleanReminderDisabled === null) {
    return NextResponse.json(
      { error: "reminderDisabled must be a boolean" },
      { status: 400 }
    );
  }

  const cleanReminderMinutes =
    reminderMinutes === undefined
      ? undefined
      : reminderMinutes === null
        ? null
        : typeof reminderMinutes === "number" && Number.isFinite(reminderMinutes)
          ? Math.trunc(reminderMinutes)
          : NaN;
  if (cleanReminderMinutes !== undefined && cleanReminderMinutes !== null) {
    if (!Number.isFinite(cleanReminderMinutes) || cleanReminderMinutes < 0 || cleanReminderMinutes > 10080) {
      return NextResponse.json(
        { error: "reminderMinutes must be an integer between 0 and 10080, or null" },
        { status: 400 }
      );
    }
  }

  let cleanLink: string | null | undefined;
  try {
    cleanLink = normalizeEventLink(link);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "link must be a valid URL" },
      { status: 400 }
    );
  }

  // Series-wide edit must drop per-occurrence overrides; otherwise GET still prefers
  // child rows and the updated master never shows for those instances.
  if (editScope === "series" && existing.recurrenceRule) {
    await prisma.event.deleteMany({
      where: { parentEventId: existing.id },
    });
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
      ...(cleanLink !== undefined && { link: cleanLink }),
      ...(startTime !== undefined && { startTime: new Date(startTime) }),
      ...(endTime !== undefined && { endTime: new Date(endTime) }),
      ...(color !== undefined && { color }),
      ...(allDay !== undefined && { allDay }),
      ...(recurrenceRule !== undefined && {
        recurrenceRule: recurrenceRule || null,
      }),
      ...(recurrenceEndDate !== undefined && {
        recurrenceEndDate: recurrenceEndDate
          ? new Date(recurrenceEndDate)
          : null,
      }),
      ...(cleanReminderMinutes !== undefined && { reminderMinutes: cleanReminderMinutes }),
      ...(cleanReminderDisabled !== undefined && { reminderDisabled: cleanReminderDisabled }),
    },
  });
  await pushLocalEventToGoogle(session.user.id, updated.id).catch((error) => {
    console.error("Google Calendar push failed", error);
  });
  bumpUserDataVersion("events", session.user.id);

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.event.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isReadOnlyGoogleCalendarId(existing.googleCalendarId)) {
    return readOnlyEventResponse();
  }

  const body = await req.json().catch(() => ({}));
  const editScope = body?.editScope;
  const instanceStartTime = body?.instanceStartTime;

  if (editScope === "single") {
    if (!existing.recurrenceRule) {
      return NextResponse.json(
        { error: "editScope=single is only supported for recurring events" },
        { status: 400 }
      );
    }
    if (!instanceStartTime) {
      return NextResponse.json(
        { error: "instanceStartTime is required when editScope=single" },
        { status: 400 }
      );
    }

    const instanceStart = new Date(instanceStartTime);
    if (Number.isNaN(instanceStart.getTime())) {
      return NextResponse.json(
        { error: "instanceStartTime must be a valid ISO timestamp" },
        { status: 400 }
      );
    }
    const instanceStartIso = instanceStart.toISOString();

    const instanceId = makeInstanceId(existing.id, instanceStartIso);
    const seriesDurationMs = existing.endTime.getTime() - existing.startTime.getTime();
    const existingOverride = await prisma.event.findUnique({
      where: { instanceId },
      select: { googleEventId: true, googleCalendarId: true, parentEventId: true },
    });
    if (existingOverride) {
      await deleteLocalEventFromGoogle(session.user.id, existingOverride).catch((error) => {
        console.error("Google Calendar delete failed", error);
      });
    }

    await prisma.event.upsert({
      where: { instanceId },
      update: {
        deleted: true,
        recurrenceRule: null,
        recurrenceEndDate: null,
      },
      create: {
        instanceId,
        parentEventId: existing.id,
        userId: session.user.id,
        title: existing.title,
        description: existing.description,
        link: existing.link,
        startTime: new Date(instanceStartIso),
        endTime: new Date(new Date(instanceStartIso).getTime() + seriesDurationMs),
        color: existing.color,
        allDay: existing.allDay,
        recurrenceRule: null,
        recurrenceEndDate: null,
        reminderMinutes: existing.reminderMinutes ?? null,
        reminderDisabled: existing.reminderDisabled ?? false,
        deleted: true,
      },
    });
    bumpUserDataVersion("events", session.user.id);
    return NextResponse.json({ success: true });
  }

  await deleteLocalEventFromGoogle(session.user.id, {
    googleEventId: existing.googleEventId,
    googleCalendarId: existing.googleCalendarId,
    parentEventId: existing.parentEventId,
  }).catch((error) => {
    console.error("Google Calendar delete failed", error);
  });
  await prisma.event.deleteMany({ where: { parentEventId: id } });
  await prisma.event.delete({ where: { id } });
  bumpUserDataVersion("events", session.user.id);
  return NextResponse.json({ success: true });
}
