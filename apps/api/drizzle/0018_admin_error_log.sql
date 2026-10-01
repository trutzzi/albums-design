CREATE TYPE "public"."error_issue_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "error_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"source" varchar(16) NOT NULL,
	"title" varchar(500) NOT NULL,
	"error_type" varchar(120),
	"error_message" text,
	"location" varchar(255),
	"status" "error_issue_status" NOT NULL,
	"occurrences" integer NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "error_issues_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "error_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"request_id" varchar(128),
	"error_message" text,
	"stack" text,
	"context" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_occurrences" ADD CONSTRAINT "error_occurrences_issue_id_error_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."error_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_issues_last_seen_at_idx" ON "error_issues" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "error_occurrences_issue_id_occurred_at_idx" ON "error_occurrences" USING btree ("issue_id","occurred_at");--> statement-breakpoint
CREATE INDEX "error_occurrences_occurred_at_idx" ON "error_occurrences" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "error_occurrences_request_id_idx" ON "error_occurrences" USING btree ("request_id");