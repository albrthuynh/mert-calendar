import { secureDatabaseUrl } from "../lib/security/databaseConnection.ts";
import nextEnvironment from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encryptToken, decryptToken, isEncryptedToken } from "../lib/security/tokenEncryption.ts";

nextEnvironment.loadEnvConfig(process.cwd(), true);
const write = process.argv.includes("--write");
if (write && (!process.argv.includes("--confirm-all-runtimes-ready") || process.env.TOKEN_ENCRYPTION_MODE === "staged")) {
  throw new Error("Deploy the new code and shared key to every database client before using --write --confirm-all-runtimes-ready with TOKEN_ENCRYPTION_MODE=enabled");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: secureDatabaseUrl(process.env.DATABASE_URL) }), log: [] });
const fields = ["access_token", "refresh_token", "id_token"];
let cursor;
let examined = 0;
let plaintext = 0;
let updated = 0;
try {
  while (true) {
    const accounts = await prisma.account.findMany({
      where: { provider: "google", ...(cursor ? { id: { gt: cursor } } : {}) },
      take: 100, orderBy: { id: "asc" },
      select: { id: true, userId: true, access_token: true, refresh_token: true, id_token: true },
    });
    if (!accounts.length) break;
    for (const account of accounts) {
      const changes = {};
      const originalTokens = {};
      examined++;
      for (const field of fields) {
        const stored = account[field];
        originalTokens[field] = stored;
        if (typeof stored !== "string") continue;
        const cleartext = decryptToken(stored, `${account.userId}:${field}`);
        if (!isEncryptedToken(stored)) plaintext++;
        if (write) changes[field] = encryptToken(cleartext, `${account.userId}:${field}`);
      }
      if (write && Object.keys(changes).length) {
        // Compare every original field so a concurrent reconnect/refresh is never overwritten.
        const result = await prisma.account.updateMany({ where: { id: account.id, ...originalTokens }, data: changes });
        updated += result.count;
      }
      cursor = account.id;
    }
  }
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", accountsExamined: examined, plaintextTokens: plaintext, accountsUpdated: updated }));
} catch {
  console.error("Token migration failed. No credentials were logged. Check the encryption key configuration and database connectivity.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
