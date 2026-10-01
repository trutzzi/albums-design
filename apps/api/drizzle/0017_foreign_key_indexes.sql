CREATE INDEX IF NOT EXISTS "photos_project_id_file_name_idx" ON "photos" USING btree ("project_id","file_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_awaiting_long_term_idx" ON "photos" USING btree ("created_at") WHERE "photos"."status" <> 'PENDING_UPLOAD' and "photos"."full_res_stored_at" is null and "photos"."staged_original_purged_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photo_analyses_project_id_idx" ON "photo_analyses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "albums_project_id_idx" ON "albums" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "download_sessions_project_id_idx" ON "download_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pick_sessions_project_id_idx" ON "pick_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_sessions_album_id_idx" ON "review_sessions" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_album_id_idx" ON "export_jobs" USING btree ("album_id");