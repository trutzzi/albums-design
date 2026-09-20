ALTER TABLE "projects" ADD COLUMN "client_name" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_email" varchar(320);--> statement-breakpoint
ALTER TABLE "download_sessions" ADD COLUMN "last_sent_to" varchar(320);--> statement-breakpoint
ALTER TABLE "download_sessions" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "last_sent_to" varchar(320);--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD COLUMN "last_sent_to" varchar(320);--> statement-breakpoint
ALTER TABLE "review_sessions" ADD COLUMN "last_sent_at" timestamp with time zone;