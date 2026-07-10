-- CreateTable
CREATE TABLE "GoogleCalendarSource" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "color" TEXT,
  "syncToken" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleCalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarSource_userId_calendarId_key" ON "GoogleCalendarSource"("userId", "calendarId");

-- AddForeignKey
ALTER TABLE "GoogleCalendarSource" ADD CONSTRAINT "GoogleCalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
