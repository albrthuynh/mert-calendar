import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const todos = await prisma.todo.findMany({
    where: {
      userId: session.user.id,
      taskDate: {
        gte: new Date(start),
        lte: new Date(end),
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(todos);
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

  return NextResponse.json(todo, { status: 201 });
}
