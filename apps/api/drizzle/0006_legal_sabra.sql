CREATE TYPE "public"."pick_status" AS ENUM('OPEN', 'SUBMITTED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "pick_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"status" "pick_status" NOT NULL,
	"picked_photo_ids" jsonb NOT NULL,
	"pick_limit" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pick_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "pick_sessions" ADD CONSTRAINT "pick_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;