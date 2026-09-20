CREATE TYPE "public"."download_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TABLE "download_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"status" "download_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"download_count" integer NOT NULL,
	"first_downloaded_at" timestamp with time zone,
	"last_downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "download_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "download_sessions" ADD CONSTRAINT "download_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;