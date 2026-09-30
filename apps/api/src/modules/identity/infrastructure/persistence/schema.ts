import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerEmail: varchar("owner_email", { length: 255 }).notNull(),
  apiKeyHash: varchar("api_key_hash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  // Client-facing branding (Studio Pro). All null until the studio sets it.
  brandName: varchar("brand_name", { length: 80 }),
  brandAccent: varchar("brand_accent", { length: 7 }),
  /** A small PNG as a data: URL — kept in the row so client pages need no storage round trip. */
  brandLogo: text("brand_logo"),
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

export const studioMembers = pgTable(
  "studio_members",
  {
    id: uuid("id").primaryKey(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studios.id),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: studioRoleEnum("role").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** scrypt hash, `salt:hash` hex-encoded. Unset for an invited member who has
     * never logged in — invitations don't carry credentials, signing up does. */
    passwordHash: varchar("password_hash", { length: 255 }),
    /** Null until the member opens the confirmation link (or proves the mailbox by a reset). */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  },
  // Deleting a studio checks this column; without an index that check reads the whole table.
  (table) => [index("studio_members_studio_id_idx").on(table.studioId)],
);
