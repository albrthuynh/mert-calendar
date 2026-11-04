import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function consumeRateLimit(identity: string, limit: number, windowSeconds: number) {
  const key = createHash("sha256").update(identity).digest("hex");
  const rows = await prisma.$queryRaw<Array<{ hits: number; retryAfter: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "hits", "expiresAt")
    VALUES (${key}, 1, clock_timestamp() + ${windowSeconds} * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "RateLimitBucket"."expiresAt" <= clock_timestamp() THEN 1
        ELSE LEAST("RateLimitBucket"."hits" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= clock_timestamp()
        THEN clock_timestamp() + ${windowSeconds} * interval '1 second'
        ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "hits", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS "retryAfter"
  `;
  return { allowed: rows[0].hits <= limit, retryAfter: rows[0].retryAfter };
}

export async function withSecurityLease<T>(key: string, operation: () => Promise<T>, leaseSeconds = 300): Promise<T | undefined> {
  const owner = randomUUID();
  const acquired = await prisma.$executeRaw`
    INSERT INTO "SecurityLease" ("key", "owner", "expiresAt")
    VALUES (${key}, ${owner}, clock_timestamp() + ${leaseSeconds} * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET "owner" = EXCLUDED."owner", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "SecurityLease"."expiresAt" <= clock_timestamp()
  `;
  if (!acquired) return undefined;
  try {
    return await operation();
  } finally {
    await prisma.$executeRaw`DELETE FROM "SecurityLease" WHERE "key" = ${key} AND "owner" = ${owner}`;
  }
}
