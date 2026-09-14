import { integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { projects } from "../../../media-ingestion/infrastructure/persistence/schema";
import type { AlbumFormat, Spread } from "../../domain/album";

export const albumStatusEnum = pgEnum("album_status", [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "EXPORTED",
]);

/**
 * Spreads live as jsonb because they are a value graph owned wholly by the album
 * aggregate: it is always loaded and written as one unit, and nothing queries a
 * placement independently. Normalising them would buy joins we never need.
 */
export const albums = pgTable("albums", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  title: varchar("title", { length: 255 }).notNull(),
  status: albumStatusEnum("status").notNull(),
  format: jsonb("format").$type<AlbumFormat>().notNull(),
  spreads: jsonb("spreads").$type<Spread[]>().notNull(),
  spreadCount: integer("spread_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
