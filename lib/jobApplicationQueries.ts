import type { Prisma } from "@prisma/client";

// Explicit projection keeps API queries independent from removed or future columns.
export const jobApplicationSelect = {
  id: true,
  title: true,
  company: true,
  dateApplied: true,
  status: true,
  applicationUrl: true,
  location: true,
  salary: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobApplicationSelect;
