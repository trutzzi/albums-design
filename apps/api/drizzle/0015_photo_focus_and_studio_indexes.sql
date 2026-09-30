ALTER TABLE "photo_analyses" ADD COLUMN IF NOT EXISTS "focus_x" real;--> statement-breakpoint
ALTER TABLE "photo_analyses" ADD COLUMN IF NOT EXISTS "focus_y" real;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_members_studio_id_idx" ON "studio_members" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_studio_id_idx" ON "projects" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_studio_id_idx" ON "feedback" USING btree ("studio_id");