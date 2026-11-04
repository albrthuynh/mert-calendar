import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, withSecurityLease } from "@/lib/security/rateLimit";

jest.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: jest.fn(), $executeRaw: jest.fn() } }));
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.exec('CREATE TABLE "User" (id TEXT PRIMARY KEY);');
  await database.exec(readFileSync(resolve("prisma/migrations/20261104000000_security_controls/migration.sql"), "utf8"));
  const execute = async (segments: TemplateStringsArray, ...parameters: unknown[]) => {
    let statement = segments[0];
    for (let index = 0; index < parameters.length; index++) statement += `$${index + 1}` + segments[index + 1];
    return database.query(statement, parameters);
  };
  (prisma.$queryRaw as jest.Mock).mockImplementation(async (...args) => (await execute(args[0], ...args.slice(1))).rows);
  (prisma.$executeRaw as jest.Mock).mockImplementation(async (...args) => (await execute(args[0], ...args.slice(1))).affectedRows);
}, 30000);
afterAll(async () => database.close());

it("enforces one shared atomic quota under concurrent requests, isolates users, and resets expired windows", async () => {
  const results = await Promise.all(Array.from({ length: 30 }, () => consumeRateLimit("user-one", 5, 60)));
  expect(results.filter((result) => result.allowed)).toHaveLength(5);
  expect(results.every((result) => result.retryAfter > 0 && result.retryAfter <= 60)).toBe(true);
  expect((await consumeRateLimit("user-two", 5, 60)).allowed).toBe(true);
  const buckets = await database.query<{ key: string }>('SELECT "key" FROM "RateLimitBucket"');
  expect(buckets.rows.every((row) => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
  await database.exec('UPDATE "RateLimitBucket" SET "expiresAt" = now() - interval \'1 second\'');
  expect((await consumeRateLimit("user-one", 5, 60)).allowed).toBe(true);
});

it("prevents overlapping syncs, releases failed operations, and allows recovery from expired owners", async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const blocked = new Promise<void>((resolve) => { finish = resolve; });
  const firstSync = withSecurityLease("sync:user", async () => { entered(); await blocked; return "first"; });
  await started;
  const secondOperation = jest.fn();
  expect(await withSecurityLease("sync:user", secondOperation)).toBeUndefined();
  expect(secondOperation).not.toHaveBeenCalled();
  expect(await withSecurityLease("sync:other-user", async () => "other")).toBe("other");
  finish();
  expect(await firstSync).toBe("first");
  await expect(withSecurityLease("sync:user", async () => { throw new Error("failed operation"); })).rejects.toThrow("failed operation");
  expect(await withSecurityLease("sync:user", async () => "recovered")).toBe("recovered");
  await database.exec('INSERT INTO "SecurityLease" VALUES (\'sync:user\', \'abandoned\', now() - interval \'1 second\')');
  expect(await withSecurityLease("sync:user", async () => "new owner")).toBe("new owner");
});
