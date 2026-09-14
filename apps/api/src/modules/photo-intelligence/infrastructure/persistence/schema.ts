import { integer, pgEnum, pgTable, real, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { photos, projects } from "../../../media-ingestion/infrastructure/persistence/schema";
import { PHOTO_CATEGORIES } from "../../domain/value-objects/photo-category";

export const photoCategoryEnum = pgEnum("photo_category", PHOTO_CATEGORIES);
export const orientationEnum = pgEnum("orientation", ["LANDSCAPE", "PORTRAIT", "SQUARE"]);

export const photoAnalyses = pgTable("photo_analyses", {
  id: uuid("id").primaryKey(),
  photoId: uuid("photo_id")
    .notNull()
    .references(() => photos.id)
    .unique(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  overallScore: integer("overall_score").notNull(),
  sharpness: integer("sharpness").notNull(),
  exposure: integer("exposure").notNull(),
  composition: integer("composition").notNull(),
  faceQuality: integer("face_quality").notNull(),
  category: photoCategoryEnum("category").notNull(),
  categoryConfidence: real("category_confidence").notNull(),
  orientation: orientationEnum("orientation").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  faceCount: integer("face_count").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull(),
  engineVersion: varchar("engine_version", { length: 32 }).notNull().default("v1"),
});
