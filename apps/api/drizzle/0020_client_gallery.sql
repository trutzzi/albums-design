ALTER TABLE "studios" ADD COLUMN "brand_website" varchar(200);--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "brand_phone" varchar(32);--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "brand_email" varchar(320);--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "brand_style" jsonb;--> statement-breakpoint
ALTER TABLE "download_sessions" ADD COLUMN "cover_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "download_sessions" ADD COLUMN "look_override" jsonb;