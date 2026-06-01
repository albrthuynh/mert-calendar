-- CreateTable
CREATE TABLE "GoogleCalendarChannel" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "resourceId" TEXT,
  "token" TEXT NOT NULL,
  "expiration" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleCalendarChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarChannel_channelId_key" ON "GoogleCalendarChannel"("channelId");

-- CreateIndex
CREATE INDEX "GoogleCalendarChannel_userId_calendarId_active_idx" ON "GoogleCalendarChannel"("userId", "calendarId", "active");

-- AddForeignKey
ALTER TABLE "GoogleCalendarChannel" ADD CONSTRAINT "GoogleCalendarChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
