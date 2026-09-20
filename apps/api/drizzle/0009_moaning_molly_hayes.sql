ALTER TABLE "pick_sessions" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "sealed_secret" text;