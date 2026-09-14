import { integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { studios } from "../../../identity/infrastructure/persistence/schema";

export const projectTypeEnum = pgEnum("project_type", ["WEDDING", "BAPTISM", "EVENT"]);
export const photoStatusEnum = pgEnum("photo_status", [
  "PENDING_UPLOAD",
  "UPLOADED",
  "ANALYSIS_QUEUED",
  "ANALYSED",
  "FAILED",
]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studios.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: projectTypeEnum("type").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  status: photoStatusEnum("status").notNull(),
  checksum: varchar("checksum", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
});
