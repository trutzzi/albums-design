CREATE TYPE "public"."slideshow_source" AS ENUM('PICKS', 'ALBUM', 'SHOOT');--> statement-breakpoint
CREATE TYPE "public"."slideshow_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."slideshow_transition" AS ENUM('FADE', 'NONE');--> statement-breakpoint
CREATE TABLE "slideshow_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"status" "slideshow_status" NOT NULL,
	"source" "slideshow_source" NOT NULL,
	"album_id" uuid,
	"photo_ids" jsonb NOT NULL,
	"interval_seconds" integer NOT NULL,
	"transition" "slideshow_transition" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"view_count" integer NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"last_sent_to" varchar(320),
	"last_sent_at" timestamp with time zone,
	"sealed_secret" text,
	CONSTRAINT "slideshow_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "slideshow_sessions" ADD CONSTRAINT "slideshow_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slideshow_sessions_project_id_idx" ON "slideshow_sessions" USING btree ("project_id");