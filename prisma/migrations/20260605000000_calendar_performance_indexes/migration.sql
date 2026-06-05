-- Speed up authenticated calendar range queries.
CREATE INDEX "Event_userId_parentEventId_deleted_idx" ON "Event"("userId", "parentEventId", "deleted");
CREATE INDEX "Event_userId_startTime_idx" ON "Event"("userId", "startTime");
CREATE INDEX "Event_userId_endTime_idx" ON "Event"("userId", "endTime");
CREATE INDEX "Event_userId_recurrenceEndDate_idx" ON "Event"("userId", "recurrenceEndDate");
CREATE INDEX "Event_userId_updatedAt_idx" ON "Event"("userId", "updatedAt");

CREATE INDEX "Todo_userId_taskDate_idx" ON "Todo"("userId", "taskDate");
