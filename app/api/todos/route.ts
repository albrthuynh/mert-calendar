import { CalendarResponseBudget, CalendarWorkloadError } from "@/lib/security/workload";
import { invalidRange } from "@/lib/security/requestValidation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpUserDataVersion } from "@/lib/inMemoryCache";
import { addDays } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 }
    );
  }

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  if (invalidRange(rangeStart, rangeEnd)) {
    return NextResponse.json(
      { error: "start and end must be valid, ordered dates no more than 400 days apart" },
      { status: 400 }
    );
  }

  // Process-local invalidation cannot see mutations handled by another server instance.
  const todos = await prisma.todo.findMany({
    take: 2001,
    where: {
      userId: session.user.id,
      taskDate: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  try {
    if (todos.length > 2000) throw new CalendarWorkloadError();
    new CalendarResponseBudget().consume(todos);
  } catch (error) {
    if (error instanceof CalendarWorkloadError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
  return NextResponse.json(todos, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, taskDate, dueDate } = body;

  if (!title || !taskDate) {
    return NextResponse.json(
      { error: "title and taskDate are required" },
      { status: 400 }
    );
  }

  // taskDate is sent from the client as an ISO instant representing local midnight.
  // Keep that exact instant to avoid server-timezone shifts in production.
  const taskDateObj = new Date(taskDate);
  const nextDay = addDays(taskDateObj, 1);

  // Find highest order for that day to append at end
  const existing = await prisma.todo.findMany({
    where: {
      userId: session.user.id,
      taskDate: {
        gte: taskDateObj,
        lt: nextDay,
      },
    },
    orderBy: { order: "desc" },
    take: 1,
  });

  const nextOrder = existing.length > 0 ? existing[0].order + 1 : 0;

  const todo = await prisma.todo.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      taskDate: taskDateObj,
      dueDate: dueDate ? new Date(dueDate) : null,
      completed: false,
      order: nextOrder,
      userId: session.user.id,
    },
  });
  bumpUserDataVersion("todos", session.user.id);

  return NextResponse.json(todo, { status: 201 });
}
