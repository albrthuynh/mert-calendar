ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
CREATE TABLE "RateLimitBucket" (
  "key" TEXT PRIMARY KEY,
  "hits" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket" ("expiresAt");
CREATE TABLE "SecurityLease" (
  "key" TEXT PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
