CREATE TYPE "public"."feedback_kind" AS ENUM('IDEA', 'PROBLEM', 'QUESTION', 'PRAISE');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('NEW', 'IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"studio_id" uuid NOT NULL,
	"member_id" uuid,
	"author_name" varchar(255) NOT NULL,
	"author_email" varchar(320) NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"message" text NOT NULL,
	"rating" integer,
	"page" varchar(512),
	"user_agent" varchar(512),
	"status" "feedback_status" NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;