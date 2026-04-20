import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bumpUserDataVersion,
  getOrSetInMemoryCache,
  getUserDataVersion,
} from "@/lib/inMemoryCache";
import { addDays } from "date-fns";

const TODOS_CACHE_TTL_MS = 2 * 60 * 1000;

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
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return NextResponse.json(
      { error: "start and end must be valid ISO timestamps" },
      { status: 400 }
    );
  }

  const version = getUserDataVersion("todos", session.user.id);
  const cacheKey = [
    "todos",
    session.user.id,
    `v${version}`,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
  ].join(":");

  const todos = await getOrSetInMemoryCache(cacheKey, TODOS_CACHE_TTL_MS, () =>
    prisma.todo.findMany({
      where: {
        userId: session.user.id,
        taskDate: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })
  );

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
  bumpUserDataVersion("todos", session.user.id);

  return NextResponse.json(todo, { status: 201 });
}
