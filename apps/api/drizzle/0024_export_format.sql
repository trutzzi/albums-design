CREATE TYPE "public"."export_format" AS ENUM('PDF', 'JPG_ZIP');--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN "format" "export_format" DEFAULT 'PDF' NOT NULL;