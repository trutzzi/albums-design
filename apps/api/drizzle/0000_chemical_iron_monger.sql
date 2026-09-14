CREATE TYPE "public"."plan_code" AS ENUM('TRIAL', 'STARTER', 'STUDIO', 'STUDIO_PRO');--> statement-breakpoint
CREATE TYPE "public"."studio_role" AS ENUM('OWNER', 'EDITOR', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('PENDING_UPLOAD', 'UPLOADED', 'ANALYSIS_QUEUED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('WEDDING', 'BAPTISM', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."orientation" AS ENUM('LANDSCAPE', 'PORTRAIT', 'SQUARE');--> statement-breakpoint
CREATE TYPE "public"."photo_category" AS ENUM('PREPARATION', 'CEREMONY', 'PORTRAIT', 'COUPLE', 'GROUP', 'DETAIL', 'VENUE', 'RECEPTION', 'CANDID');--> statement-breakpoint
CREATE TYPE "public"."album_status" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'EXPORTED');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('OPEN', 'CHANGES_REQUESTED', 'APPROVED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('QUEUED', 'RENDERING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TABLE "studio_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"studio_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "studio_role" NOT NULL,
	"invited_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "studios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"owner_email" varchar(255) NOT NULL,
	"api_key_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "studios_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"studio_id" uuid NOT NULL,
	"plan_code" "plan_code" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"albums_used" integer DEFAULT 0 NOT NULL,
	"external_customer_id" varchar(128),
	"external_subscription_id" varchar(128),
	CONSTRAINT "subscriptions_studio_id_unique" UNIQUE("studio_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"byte_size" integer NOT NULL,
	"status" "photo_status" NOT NULL,
	"checksum" varchar(128),
	"created_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "project_type" NOT NULL,
	"event_date" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"photo_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"sharpness" integer NOT NULL,
	"exposure" integer NOT NULL,
	"composition" integer NOT NULL,
	"face_quality" integer NOT NULL,
	"category" "photo_category" NOT NULL,
	"category_confidence" real NOT NULL,
	"orientation" "orientation" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"face_count" integer NOT NULL,
	"captured_at" timestamp with time zone,
	"analyzed_at" timestamp with time zone NOT NULL,
	"engine_version" varchar(32) DEFAULT 'v1' NOT NULL,
	CONSTRAINT "photo_analyses_photo_id_unique" UNIQUE("photo_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "album_status" NOT NULL,
	"format" jsonb NOT NULL,
	"spreads" jsonb NOT NULL,
	"spread_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"status" "review_status" NOT NULL,
	"comments" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" uuid NOT NULL,
	"print_profile_id" varchar(64) NOT NULL,
	"status" "export_status" NOT NULL,
	"storage_key" varchar(512),
	"byte_size" integer,
	"page_count" integer,
	"failure_reason" text,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "studio_members" ADD CONSTRAINT "studio_members_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_analyses" ADD CONSTRAINT "photo_analyses_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_analyses" ADD CONSTRAINT "photo_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;