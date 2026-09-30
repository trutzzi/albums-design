ALTER TABLE "studio_members" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Everyone who signed up before confirmation existed keeps signing in as before.
UPDATE "studio_members" SET "email_verified_at" = COALESCE("accepted_at", "invited_at") WHERE "password_hash" IS NOT NULL;
