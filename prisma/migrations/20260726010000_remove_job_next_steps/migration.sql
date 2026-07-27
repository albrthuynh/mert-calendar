DROP INDEX "JobApplication_userId_nextActionDate_idx";

ALTER TABLE "JobApplication"
DROP COLUMN "nextActionDate",
DROP COLUMN "nextStep";
