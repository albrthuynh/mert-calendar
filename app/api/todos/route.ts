import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";

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
        gte: startOfDay(new Date(start)),
        lte: endOfDay(new Date(end)),
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

  const taskDateObj = startOfDay(new Date(taskDate));

  // Find highest order for that day to append at end
  const existing = await prisma.todo.findMany({
    where: {
      userId: session.user.id,
      taskDate: {
        gte: startOfDay(taskDateObj),
        lte: endOfDay(taskDateObj),
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
