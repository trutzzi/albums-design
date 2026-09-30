import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
