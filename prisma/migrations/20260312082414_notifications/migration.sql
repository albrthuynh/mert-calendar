-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "reminderDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderMinutes" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultReminderMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "notificationSound" TEXT,
ADD COLUMN     "notificationSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notificationVolume" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
