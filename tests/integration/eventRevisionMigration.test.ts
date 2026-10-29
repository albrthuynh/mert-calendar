import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("increments revisions for inserts, bulk changes and deletes, with transactional rollback", async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "User" (id TEXT PRIMARY KEY); CREATE TABLE "Event" (id TEXT PRIMARY KEY, "userId" TEXT REFERENCES "User"(id), title TEXT);');
    await database.exec(readFileSync(resolve("prisma/migrations/20261029000000_event_revisions/migration.sql"), "utf8"));
    await database.exec(`INSERT INTO "User" (id) VALUES ('one'), ('two');
      INSERT INTO "Event" VALUES ('a', 'one', 'A'), ('b', 'one', 'B');`);
    const revision = async () => (await database.query<{ eventsRevision: number }>('SELECT "eventsRevision" FROM "User" WHERE id = \'one\'')).rows[0].eventsRevision;
    expect(String(await revision())).toBe("1");
    await database.exec('UPDATE "Event" SET title = \'changed\';');
    expect(String(await revision())).toBe("2");
    await database.exec('BEGIN; DELETE FROM "Event"; ROLLBACK;');
    expect(String(await revision())).toBe("2");
    await database.exec('DELETE FROM "Event";');
    expect(String(await revision())).toBe("3");
    await database.exec('DELETE FROM "Event";');
    expect(String(await revision())).toBe("3");
    const other = await database.query<{ eventsRevision: number }>('SELECT "eventsRevision" FROM "User" WHERE id = \'two\'');
    expect(String(other.rows[0].eventsRevision)).toBe("0");
  } finally { await database.close(); }
}, 30000);
