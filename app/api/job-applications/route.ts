import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jobApplicationSelect } from "@/lib/jobApplicationQueries";
import {
  isDateOnlyString,
  isJobApplicationStatus,
  normalizeApplicationUrl,
  optionalTrimmedString,
} from "@/lib/jobApplications";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobApplications = await prisma.jobApplication.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: jobApplicationSelect,
  });

  return NextResponse.json(jobApplications);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = optionalTrimmedString(body.title) ?? "";
  const company = optionalTrimmedString(body.company) ?? "";

  if (!isDateOnlyString(body.dateApplied)) {
    return NextResponse.json(
      { error: "A valid application date is required" },
      { status: 400 }
    );
  }

  if (!isJobApplicationStatus(body.status)) {
    return NextResponse.json({ error: "Invalid application status" }, { status: 400 });
  }

  const applicationUrl = normalizeApplicationUrl(body.applicationUrl);
  if (body.applicationUrl && !applicationUrl) {
    return NextResponse.json({ error: "Invalid application link" }, { status: 400 });
  }

  const jobApplication = await prisma.jobApplication.create({
    data: {
      title,
      company,
      dateApplied: body.dateApplied,
      status: body.status,
      applicationUrl,
      location: optionalTrimmedString(body.location),
      salary: optionalTrimmedString(body.salary),
      notes: optionalTrimmedString(body.notes),
      userId: session.user.id,
    },
    select: jobApplicationSelect,
  });

  return NextResponse.json(jobApplication, { status: 201 });
}
