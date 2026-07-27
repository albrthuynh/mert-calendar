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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existingApplication = await prisma.jobApplication.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!existingApplication) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const updatedApplication = await prisma.jobApplication.update({
    where: { id },
    data: {
      title,
      company,
      dateApplied: body.dateApplied,
      status: body.status,
      applicationUrl,
      location: optionalTrimmedString(body.location),
      salary: optionalTrimmedString(body.salary),
      notes: optionalTrimmedString(body.notes),
    },
    select: jobApplicationSelect,
  });

  return NextResponse.json(updatedApplication);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deletedApplication = await prisma.jobApplication.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (deletedApplication.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
