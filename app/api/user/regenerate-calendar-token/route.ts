import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  
  if (!userExists) {
    return NextResponse.json(
      { error: "Session invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  // Generate a new token (Prisma will generate a new cuid)
  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      calendarSubscriptionToken: undefined, // Reset to trigger default
    },
    select: {
      calendarSubscriptionToken: true,
    },
  });

  // If undefined is returned, manually set a new cuid
  let newToken = updated.calendarSubscriptionToken;
  if (!newToken) {
    const { randomBytes } = await import("crypto");
    newToken = randomBytes(16).toString("hex");
    await prisma.user.update({
      where: { id: session.user.id },
      data: { calendarSubscriptionToken: newToken },
    });
  }

  return NextResponse.json({
    calendarSubscriptionToken: newToken,
  });
}
