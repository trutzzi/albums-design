import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { studios } from "../../../identity/infrastructure/persistence/schema";

export const projectTypeEnum = pgEnum("project_type", ["WEDDING", "BAPTISM", "EVENT"]);
export const photoStatusEnum = pgEnum("photo_status", [
  "PENDING_UPLOAD",
  "UPLOADED",
  "ANALYSIS_QUEUED",
  "ANALYSED",
  "FAILED",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studios.id),
    name: varchar("name", { length: 255 }).notNull(),
    type: projectTypeEnum("type").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    clientName: varchar("client_name", { length: 255 }),
    clientEmail: varchar("client_email", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // Deleting a studio checks this column; without an index that check reads the whole table.
  (table) => [index("projects_studio_id_idx").on(table.studioId)],
);

export const photos = pgTable(
  "photos",
  {
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
    hasDerivatives: boolean("has_derivatives").notNull().default(false),
    permanentDerivatives: boolean("permanent_derivatives").notNull().default(false),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    fullResStoredAt: timestamp("full_res_stored_at", { withTimezone: true }),
    stagedOriginalPurgedAt: timestamp("staged_original_purged_at", { withTimezone: true }),
  },
  (table) => [
    // Every listing, count and cover lookup filters by shoot; file name is the order they are shown in.
    index("photos_project_id_file_name_idx").on(table.projectId, table.fileName),
    // The five-minute long-term storage sweep reads only these, oldest first.
    index("photos_awaiting_long_term_idx")
      .on(table.createdAt)
      .where(sql`${table.status} <> 'PENDING_UPLOAD' and ${table.fullResStoredAt} is null and ${table.stagedOriginalPurgedAt} is null`),
  ],
);
