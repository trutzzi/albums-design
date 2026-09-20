CREATE TYPE "public"."pick_stage" AS ENUM('SHORTLIST', 'FINAL');--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "shortlisted_photo_ids" jsonb;--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "stage" "pick_stage";--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "first_reached_final_at" timestamp with time zone;