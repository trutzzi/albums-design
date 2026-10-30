import { doublePrecision, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { albums } from "../../../album-composition/infrastructure/persistence/schema";

export const exportStatusEnum = pgEnum("export_status", ["QUEUED", "RENDERING", "READY", "FAILED"]);

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: uuid("id").primaryKey(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id),
    printProfileId: varchar("print_profile_id", { length: 64 }).notNull(),
    status: exportStatusEnum("status").notNull(),
    storageKey: varchar("storage_key", { length: 512 }),
    byteSize: integer("byte_size"),
    pageCount: integer("page_count"),
    // Exact for sizes like 215.9 mm (8.5 in), which a 4-byte real would read back as 215.89999.
    pageWidthMm: doublePrecision("page_width_mm"),
    pageHeightMm: doublePrecision("page_height_mm"),
    failureReason: text("failure_reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("export_jobs_album_id_idx").on(table.albumId)],
);
