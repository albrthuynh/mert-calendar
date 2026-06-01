-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleCalendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "googleCalendarSyncToken" TEXT,
ADD COLUMN "googleCalendarLastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "googleCalendarId" TEXT,
ADD COLUMN "googleEventId" TEXT,
ADD COLUMN "googleEtag" TEXT,
ADD COLUMN "googleUpdatedAt" TIMESTAMP(3),
ADD COLUMN "googleSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Event_userId_googleCalendarId_googleEventId_key" ON "Event"("userId", "googleCalendarId", "googleEventId");
