import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function makeInstanceId(seriesId: string, instanceStartTimeIso: string) {
  return `${seriesId}__${instanceStartTimeIso}`;
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
    const instanceStartIso = new Date(instanceStartTime).toISOString();
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

    const override = await prisma.event.upsert({
      where: { instanceId },
      update: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && {
          description: description?.trim() || null,
        }),
        ...(startTime !== undefined && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: new Date(endTime) }),
        ...(color !== undefined && { color }),
        ...(allDay !== undefined && { allDay }),
        ...(cleanReminderMinutes !== undefined && { reminderMinutes: cleanReminderMinutes }),
        ...(cleanReminderDisabled !== undefined && { reminderDisabled: cleanReminderDisabled }),
        // A per-instance override is always non-recurring.
        recurrenceRule: null,
        recurrenceEndDate: null,
      },
      create: {
        instanceId,
        parentEventId: existing.id,
        userId: session.user.id,
        title: typeof title === "string" ? title.trim() : existing.title,
        description:
          description === undefined ? existing.description : description?.trim() || null,
        startTime: startTime ? new Date(startTime) : new Date(instanceStartIso),
        endTime: endTime
          ? new Date(endTime)
          : new Date(new Date(instanceStartIso).getTime() + seriesDurationMs),
        color: color ?? existing.color,
        allDay: allDay ?? existing.allDay,
        recurrenceRule: null,
        recurrenceEndDate: null,
        reminderMinutes:
          cleanReminderMinutes === undefined ? (existing.reminderMinutes ?? null) : cleanReminderMinutes,
        reminderDisabled:
          cleanReminderDisabled === undefined ? (existing.reminderDisabled ?? false) : cleanReminderDisabled,
      },
    });

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

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
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

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
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

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
