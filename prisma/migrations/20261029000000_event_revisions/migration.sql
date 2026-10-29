ALTER TABLE "User" ADD COLUMN "eventsRevision" BIGINT NOT NULL DEFAULT 0;

-- Statement triggers keep bulk imports/deletes to one revision update per user.
-- The revision commits or rolls back with the event changes, including raw SQL.
CREATE FUNCTION bump_event_revisions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "User" SET "eventsRevision" = "eventsRevision" + 1
    WHERE "id" IN (SELECT DISTINCT "userId" FROM new_events);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "User" SET "eventsRevision" = "eventsRevision" + 1
    WHERE "id" IN (SELECT DISTINCT "userId" FROM old_events);
  ELSE
    UPDATE "User" SET "eventsRevision" = "eventsRevision" + 1
    WHERE "id" IN (
      SELECT "userId" FROM old_events
      UNION
      SELECT "userId" FROM new_events
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER event_insert_revision AFTER INSERT ON "Event"
REFERENCING NEW TABLE AS new_events
FOR EACH STATEMENT EXECUTE FUNCTION bump_event_revisions();

CREATE TRIGGER event_update_revision AFTER UPDATE ON "Event"
REFERENCING OLD TABLE AS old_events NEW TABLE AS new_events
FOR EACH STATEMENT EXECUTE FUNCTION bump_event_revisions();

CREATE TRIGGER event_delete_revision AFTER DELETE ON "Event"
REFERENCING OLD TABLE AS old_events
FOR EACH STATEMENT EXECUTE FUNCTION bump_event_revisions();
