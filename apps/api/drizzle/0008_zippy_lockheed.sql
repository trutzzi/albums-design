ALTER TABLE "download_sessions" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "download_sessions" ADD COLUMN "sealed_secret" text;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD COLUMN "sealed_secret" text;