import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("preserves existing events and leaves legacy ownership unknown until Google markers are checked", async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "Event" (id TEXT PRIMARY KEY, "startTime" TIMESTAMP);');
    await database.exec(`INSERT INTO "Event" VALUES ('legacy', '2026-10-25 17:30:00');`);
    await database.exec(readFileSync(resolve("prisma/migrations/20261102000000_event_sync_authority/migration.sql"), "utf8"));
    const result = await database.query('SELECT id, "timeZone", "googleManagedByMert" FROM "Event"');
    expect(result.rows).toEqual([{ id: "legacy", timeZone: null, googleManagedByMert: false }]);
    await database.exec(`UPDATE "Event" SET "timeZone" = 'America/Chicago', "googleManagedByMert" = true WHERE id = 'legacy';`);
    const repaired = await database.query('SELECT "timeZone", "googleManagedByMert" FROM "Event"');
    expect(repaired.rows).toEqual([{ timeZone: "America/Chicago", googleManagedByMert: true }]);
  } finally { await database.close(); }
}, 30000);
