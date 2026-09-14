import { jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
});
