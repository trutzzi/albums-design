import { integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerEmail: varchar("owner_email", { length: 255 }).notNull(),
  apiKeyHash: varchar("api_key_hash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const planCodeEnum = pgEnum("plan_code", ["TRIAL", "STARTER", "STUDIO", "STUDIO_PRO"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
]);
export const studioRoleEnum = pgEnum("studio_role", ["OWNER", "EDITOR", "VIEWER"]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studios.id)
    .unique(),
  planCode: planCodeEnum("plan_code").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  albumsUsed: integer("albums_used").notNull().default(0),
  externalCustomerId: varchar("external_customer_id", { length: 128 }),
  externalSubscriptionId: varchar("external_subscription_id", { length: 128 }),
});

export const studioMembers = pgTable("studio_members", {
  id: uuid("id").primaryKey(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studios.id),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: studioRoleEnum("role").notNull(),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});
