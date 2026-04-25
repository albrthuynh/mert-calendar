-- Add nullable event link storage. Existing rows remain unchanged.
ALTER TABLE "Event" ADD COLUMN "link" TEXT;
