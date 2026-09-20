ALTER TABLE "photos" ADD COLUMN "permanent_derivatives" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "full_res_stored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "staged_original_purged_at" timestamp with time zone;