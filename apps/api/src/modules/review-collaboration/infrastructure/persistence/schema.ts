import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { projects } from "../../../media-ingestion/infrastructure/persistence/schema";
import { albums } from "../../../album-composition/infrastructure/persistence/schema";
import type { ReviewComment } from "../../domain/review-session";

export const reviewStatusEnum = pgEnum("review_status", [
  "OPEN",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REVOKED",
]);

export interface StoredComment extends Omit<ReviewComment, "createdAt"> {
  createdAt: string;
}

export const reviewSessions = pgTable("review_sessions", {
  id: uuid("id").primaryKey(),
  albumId: uuid("album_id")
    .notNull()
    .references(() => albums.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  status: reviewStatusEnum("status").notNull(),
  comments: jsonb("comments").$type<StoredComment[]>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  passwordHash: text("password_hash"),
  sealedSecret: text("sealed_secret"),
});

export const pickStatusEnum = pgEnum("pick_status", ["OPEN", "SUBMITTED", "REVOKED"]);

/** A client's photo selection for one shoot — the step before an album exists. */
export const pickSessions = pgTable("pick_sessions", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  status: pickStatusEnum("status").notNull(),
  pickedPhotoIds: jsonb("picked_photo_ids").$type<string[]>().notNull(),
  pickLimit: integer("pick_limit"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  passwordHash: text("password_hash"),
  sealedSecret: text("sealed_secret"),
});

export const downloadStatusEnum = pgEnum("download_status", ["ACTIVE", "REVOKED"]);

/** A time-limited link that lets a client download every photo of a shoot. */
export const downloadSessions = pgTable("download_sessions", {
  id: uuid("id").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  status: downloadStatusEnum("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  downloadCount: integer("download_count").notNull(),
  firstDownloadedAt: timestamp("first_downloaded_at", { withTimezone: true }),
  lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  passwordHash: text("password_hash"),
  sealedSecret: text("sealed_secret"),
});
