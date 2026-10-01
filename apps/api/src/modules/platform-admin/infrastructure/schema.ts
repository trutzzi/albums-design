import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { ErrorContextValue } from "../../../shared-kernel/error-sink";
import { studios } from "../../identity/infrastructure/persistence/schema";

export const feedbackKindEnum = pgEnum("feedback_kind", ["IDEA", "PROBLEM", "QUESTION", "PRAISE"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["NEW", "IN_PROGRESS", "RESOLVED"]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studios.id),
    memberId: uuid("member_id"),
    authorName: varchar("author_name", { length: 255 }).notNull(),
    authorEmail: varchar("author_email", { length: 320 }).notNull(),
    kind: feedbackKindEnum("kind").notNull(),
    message: text("message").notNull(),
    rating: integer("rating"),
    page: varchar("page", { length: 512 }),
    userAgent: varchar("user_agent", { length: 512 }),
    status: feedbackStatusEnum("status").notNull(),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  // Deleting a studio checks this column; without an index that check reads the whole table.
  (table) => [index("feedback_studio_id_idx").on(table.studioId)],
);

export const errorIssueStatusEnum = pgEnum("error_issue_status", ["OPEN", "RESOLVED"]);

/** One row per distinct failure (see `fingerprintOf`), counted across every occurrence. */
export const errorIssues = pgTable(
  "error_issues",
  {
    id: uuid("id").primaryKey(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull().unique(),
    source: varchar("source", { length: 16 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    errorType: varchar("error_type", { length: 120 }),
    errorMessage: text("error_message"),
    location: varchar("location", { length: 255 }),
    status: errorIssueStatusEnum("status").notNull(),
    occurrences: integer("occurrences").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  // The list is always newest first.
  (table) => [index("error_issues_last_seen_at_idx").on(table.lastSeenAt)],
);

/** Each time an issue happened; purged after ERROR_LOG_RETENTION_DAYS. */
export const errorOccurrences = pgTable(
  "error_occurrences",
  {
    id: uuid("id").primaryKey(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => errorIssues.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    requestId: varchar("request_id", { length: 128 }),
    errorMessage: text("error_message"),
    stack: text("stack"),
    context: jsonb("context").$type<Record<string, ErrorContextValue>>().notNull(),
  },
  (table) => [
    // An issue's latest occurrences; the retention purge; looking a request id up.
    index("error_occurrences_issue_id_occurred_at_idx").on(table.issueId, table.occurredAt),
    index("error_occurrences_occurred_at_idx").on(table.occurredAt),
    index("error_occurrences_request_id_idx").on(table.requestId),
  ],
);
