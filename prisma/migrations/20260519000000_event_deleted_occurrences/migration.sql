-- Add tombstones for deleted recurring occurrences.
ALTER TABLE "Event" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false;
