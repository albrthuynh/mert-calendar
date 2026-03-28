import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const startKey = searchParams.get("startKey");
  const endKey = searchParams.get("endKey");

  if (!startKey || !endKey || !DATE_KEY.test(startKey) || !DATE_KEY.test(endKey)) {
    return NextResponse.json(
      { error: "startKey and endKey query params (YYYY-MM-DD) are required" },
      { status: 400 }
    );
  }

  const rows = await prisma.importantDay.findMany({
    where: {
      userId: session.user.id,
      date: { gte: startKey, lte: endKey },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const date = typeof body.date === "string" ? body.date.trim() : "";

  if (!DATE_KEY.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const labelRaw = body.label;
  if (typeof labelRaw !== "string" || !labelRaw.trim()) {
    return NextResponse.json(
      { error: "label is required" },
      { status: 400 }
    );
  }

  const label = labelRaw.trim().slice(0, 120);

  const row = await prisma.importantDay.upsert({
    where: {
      userId_date: { userId: session.user.id, date },
    },
    create: {
      date,
      userId: session.user.id,
      label,
    },
    update: { label },
  });

  return NextResponse.json(row, { status: 201 });
}
