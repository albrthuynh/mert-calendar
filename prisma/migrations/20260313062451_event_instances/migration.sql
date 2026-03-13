-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "instanceId" TEXT,
ADD COLUMN     "parentEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_instanceId_key" ON "Event"("instanceId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "instanceId" TEXT,
ADD COLUMN     "parentEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_instanceId_key" ON "Event"("instanceId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
