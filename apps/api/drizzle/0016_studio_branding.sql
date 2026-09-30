ALTER TABLE "studios" ADD COLUMN IF NOT EXISTS "brand_name" varchar(80);--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN IF NOT EXISTS "brand_accent" varchar(7);--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN IF NOT EXISTS "brand_logo" text;