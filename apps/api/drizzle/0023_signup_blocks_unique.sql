-- #53 could store the same block twice; keep the oldest of each before the index forbids it.
DELETE FROM "signup_blocks" a USING "signup_blocks" b
WHERE a."kind" = b."kind" AND a."value" = b."value"
  AND (a."created_at", a."id") > (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "signup_blocks_kind_value_idx" ON "signup_blocks" USING btree ("kind","value");