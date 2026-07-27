CREATE TYPE "JobApplicationStatus" AS ENUM ('APPLIED', 'OA', 'INTERVIEWING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "dateApplied" TEXT NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "applicationUrl" TEXT,
    "location" TEXT,
    "salary" TEXT,
    "notes" TEXT,
    "nextStep" TEXT,
    "nextActionDate" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobApplication_userId_status_idx" ON "JobApplication"("userId", "status");
CREATE INDEX "JobApplication_userId_dateApplied_idx" ON "JobApplication"("userId", "dateApplied");
CREATE INDEX "JobApplication_userId_nextActionDate_idx" ON "JobApplication"("userId", "nextActionDate");

ALTER TABLE "JobApplication"
ADD CONSTRAINT "JobApplication_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
