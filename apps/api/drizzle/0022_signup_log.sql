CREATE TYPE "public"."signup_block_kind" AS ENUM('IP', 'NETWORK', 'EMAIL_DOMAIN');--> statement-breakpoint
CREATE TYPE "public"."signup_outcome" AS ENUM('CONFIRMATION_SENT', 'TRAPPED', 'HUMAN_CHECK_FAILED', 'RATE_LIMITED', 'BLOCKED', 'ALREADY_REGISTERED', 'INVALID');--> statement-breakpoint
CREATE TABLE "signup_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"email" varchar(320) NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(512),
	"language" varchar(128),
	"referer" varchar(512),
	"outcome" "signup_outcome" NOT NULL,
	"member_id" uuid,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signup_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "signup_block_kind" NOT NULL,
	"value" varchar(255) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "signup_attempts_at_idx" ON "signup_attempts" USING btree ("at");--> statement-breakpoint
CREATE INDEX "signup_attempts_member_id_idx" ON "signup_attempts" USING btree ("member_id");