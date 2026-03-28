UPDATE "ImportantDay" SET "label" = 'Important' WHERE "label" IS NULL;

ALTER TABLE "ImportantDay" ALTER COLUMN "label" SET NOT NULL;
