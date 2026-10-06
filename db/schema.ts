// FindEkifo data model (Drizzle ORM, PostgreSQL).
// Money is always whole Uganda Shillings in integer columns — UGX has no minor unit in practice.
import { sql, relations } from "drizzle-orm";
import {
  pgTable, pgEnum, text, integer, boolean, timestamp, doublePrecision, jsonb, uuid,
  index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ─── Enums ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["SEEKER", "LANDLORD", "ADMIN"]);
export const landlordStatusEnum = pgEnum("landlord_status", ["NONE", "PENDING", "VERIFIED", "REJECTED"]);
export const categoryEnum = pgEnum("category", ["HOSTEL", "ARCADE", "RESIDENTIAL", "FLEXI_STAY"]);
export const propertyStatusEnum = pgEnum("property_status", ["DRAFT", "PENDING_REVIEW", "LIVE", "REJECTED", "SUSPENDED"]);
export const yakaEnum = pgEnum("yaka_setup", ["PRIVATE", "SHARED", "INCLUSIVE", "NONE"]);
export const waterEnum = pgEnum("water_setup", ["NWSC", "GRAVITY_TANK", "BOTH", "NONE"]);
export const mediaKindEnum = pgEnum("media_kind", ["PHOTO", "VIDEO", "TOUR_360", "FLOOR_PLAN"]);
export const cycleEnum = pgEnum("price_cycle", ["PER_DAY", "PER_MONTH", "PER_SEMESTER"]);
export const unitStatusEnum = pgEnum("unit_status", ["VACANT", "RESERVED", "OCCUPIED", "UNLISTED"]);
export const visitStatusEnum = pgEnum("visit_status", [
  "REQUESTED", "CONFIRMED", "RESCHEDULED", "DECLINED", "COMPLETED", "NO_SHOW", "CANCELLED",
]);
export const holdStatusEnum = pgEnum("hold_status", [
  "PENDING_PAYMENT", // created, waiting for the Mobile Money PIN
  "HELD", //            paid; money in escrow; unit RESERVED
  "CONFIRMED", //       moved in; escrow released to landlord minus commission
  "REFUNDED", //        landlord no-show, dispute won, or cancelled in the free window
  "EXPIRED", //         payment never completed
  "CANCELLED",
]);
export const networkEnum = pgEnum("network", ["MTN", "AIRTEL"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "SUCCESSFUL", "FAILED"]);
export const ledgerAccountEnum = pgEnum("ledger_account", [
  "MOBILE_MONEY_CLEARING", // cash that came in from MTN/Airtel (goes negative as money arrives)
  "ESCROW", //                seeker deposits held by the platform
  "LANDLORD_PAYABLE", //      owed to a landlord (owner_id = landlord)
  "PLATFORM_REVENUE", //      commission earned
  "PAYOUT_CLEARING", //       cash sent to landlords
  "REFUND_CLEARING", //       cash sent back to seekers
]);
export const payoutMethodEnum = pgEnum("payout_method", ["MTN", "AIRTEL", "BANK"]);
export const payoutStatusEnum = pgEnum("payout_status", ["REQUESTED", "APPROVED", "PAID", "REJECTED", "FAILED"]);
export const flagKindEnum = pgEnum("flag_kind", ["USER_REPORT", "DUPLICATE_MEDIA", "NON_RESPONSIVE", "CANCELLATION_DISPUTE"]);
export const flagStatusEnum = pgEnum("flag_status", ["OPEN", "RESOLVED", "DISMISSED"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["PENDING", "SENT", "FAILED"]);

// ─── Identity ────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  phone: text("phone").notNull().unique(), // E.164: +2567XXXXXXXX
  name: text("name"),
  role: roleEnum("role").notNull().default("SEEKER"),
  landlordStatus: landlordStatusEnum("landlord_status").notNull().default("NONE"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(), // sha256 of the cookie; raw token never stored
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const otpChallenges = pgTable("otp_challenges", {
  id: id(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("otp_phone_idx").on(t.phone, t.createdAt)]);

export const landlordVerifications = pgTable("landlord_verifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  ninHash: text("nin_hash").notNull(), // HMAC(APP_SECRET, NIN): detects one NIN across accounts without storing it
  ninLast4: text("nin_last4").notNull(),
  ninPhotoUrl: text("nin_photo_url").notNull(),
  selfieUrl: text("selfie_url").notNull(),
  authorityDocUrl: text("authority_doc_url").notNull(),
  status: landlordStatusEnum("status").notNull().default("PENDING"),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("lv_status_idx").on(t.status, t.createdAt),
  index("lv_nin_idx").on(t.ninHash),
]);

// ─── Inventory ───────────────────────────────────────────────────────────────
export const properties = pgTable("properties", {
  id: id(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  district: text("district").notNull(),
  suburb: text("suburb").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  description: text("description").notNull().default(""),
  yaka: yakaEnum("yaka").notNull().default("PRIVATE"),
  water: waterEnum("water").notNull().default("NWSC"),
  security: text("security").array().notNull().default(sql`'{}'::text[]`),
  amenities: text("amenities").array().notNull().default(sql`'{}'::text[]`),
  status: propertyStatusEnum("status").notNull().default("DRAFT"),
  reviewNote: text("review_note"),
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  ratingAvg: doublePrecision("rating_avg").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  // Denormalised for fast search; kept in sync by lib/inventory.ts#refreshPropertyStats
  minPriceUgx: integer("min_price_ugx"),
  vacantCount: integer("vacant_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [
  index("prop_search_idx").on(t.status, t.category, t.suburb),
  index("prop_price_idx").on(t.status, t.minPriceUgx),
  index("prop_owner_idx").on(t.ownerId),
]);

export const media = pgTable("media", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  kind: mediaKindEnum("kind").notNull().default("PHOTO"),
  url: text("url").notNull(),
  publicId: text("public_id"),
  checksum: text("checksum"), // Cloudinary etag — same image on two listings ⇒ duplicate flag
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index("media_prop_idx").on(t.propertyId, t.position),
  index("media_checksum_idx").on(t.checksum),
]);

export const units = pgTable("units", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // "Room B12", "Stall 4", "Apt 2A"
  priceUgx: integer("price_ugx").notNull(),
  cycle: cycleEnum("cycle").notNull(),
  depositUgx: integer("deposit_ugx").notNull(), // commitment hold the seeker pays to lock the unit
  sizeSqft: integer("size_sqft"),
  beds: integer("beds"),
  status: unitStatusEnum("status").notNull().default("VACANT"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("unit_label_uq").on(t.propertyId, t.label),
  index("unit_status_idx").on(t.status, t.priceUgx),
]);

// ─── Demand ──────────────────────────────────────────────────────────────────
export const visits = pgTable("visit_requests", {
  id: id(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  seekerId: uuid("seeker_id").notNull().references(() => users.id),
  slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
  proposedSlot: timestamp("proposed_slot", { withTimezone: true }),
  note: text("note"),
  status: visitStatusEnum("status").notNull().default("REQUESTED"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("visit_dedupe_uq").on(t.unitId, t.seekerId, t.slotStart),
  index("visit_unit_idx").on(t.unitId, t.status),
  index("visit_seeker_idx").on(t.seekerId, t.createdAt),
]);

export const holds = pgTable("holds", {
  id: id(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  seekerId: uuid("seeker_id").notNull().references(() => users.id),
  amountUgx: integer("amount_ugx").notNull(),
  commissionUgx: integer("commission_ugx").notNull(),
  status: holdStatusEnum("status").notNull().default("PENDING_PAYMENT"),
  paymentDeadline: timestamp("payment_deadline", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  heldUntil: timestamp("held_until", { withTimezone: true }),
  moveInDate: timestamp("move_in_date", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // THE double-booking guard: at most one live hold per unit, enforced by Postgres itself.
  uniqueIndex("one_active_hold_per_unit")
    .on(t.unitId)
    .where(sql`status in ('PENDING_PAYMENT','HELD')`),
  index("hold_seeker_idx").on(t.seekerId, t.createdAt),
  index("hold_deadline_idx").on(t.status, t.paymentDeadline),
  index("hold_held_until_idx").on(t.status, t.heldUntil),
]);

export const payments = pgTable("payments", {
  id: id(),
  holdId: uuid("hold_id").notNull().references(() => holds.id),
  provider: text("provider").notNull(), // "flutterwave" | "mock"
  txRef: text("tx_ref").notNull().unique(), // our reference; idempotency key for webhooks
  providerRef: text("provider_ref"),
  amountUgx: integer("amount_ugx").notNull(),
  msisdn: text("msisdn").notNull(),
  network: networkEnum("network").notNull(),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  failureText: text("failure_text"),
  raw: jsonb("raw"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("payment_hold_idx").on(t.holdId)]);

// ─── Money: append-only double-entry ledger ─────────────────────────────────
// Each movement writes ≥2 rows sharing tx_group whose amounts sum to 0. Rows are never updated.
export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  txGroup: uuid("tx_group").notNull(),
  account: ledgerAccountEnum("account").notNull(),
  ownerId: uuid("owner_id"),
  amount: integer("amount").notNull(),
  holdId: uuid("hold_id").references(() => holds.id),
  payoutId: uuid("payout_id").references(() => payouts.id),
  memo: text("memo").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("ledger_account_idx").on(t.account, t.ownerId),
  index("ledger_group_idx").on(t.txGroup),
  index("ledger_hold_idx").on(t.holdId),
]);

export const payouts = pgTable("payouts", {
  id: id(),
  landlordId: uuid("landlord_id").notNull().references(() => users.id),
  amountUgx: integer("amount_ugx").notNull(),
  method: payoutMethodEnum("method").notNull(),
  destination: text("destination").notNull(),
  status: payoutStatusEnum("status").notNull().default("REQUESTED"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("payout_status_idx").on(t.status, t.createdAt),
  index("payout_landlord_idx").on(t.landlordId, t.createdAt),
]);

// ─── Tenancy & compliance ────────────────────────────────────────────────────
export const tenancies = pgTable("tenancies", {
  id: id(),
  holdId: uuid("hold_id").notNull().unique().references(() => holds.id),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  tenantId: uuid("tenant_id").notNull().references(() => users.id),
  landlordId: uuid("landlord_id").notNull().references(() => users.id),
  rentUgx: integer("rent_ugx").notNull(),
  cycle: cycleEnum("cycle").notNull(),
  depositUgx: integer("deposit_ugx").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  requiresWritten: boolean("requires_written").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("tenancy_unit_idx").on(t.unitId),
  index("tenancy_tenant_idx").on(t.tenantId),
  index("tenancy_landlord_idx").on(t.landlordId),
]);

export const rentChanges = pgTable("rent_changes", {
  id: id(),
  tenancyId: uuid("tenancy_id").notNull().references(() => tenancies.id),
  oldRentUgx: integer("old_rent_ugx").notNull(),
  newRentUgx: integer("new_rent_ugx").notNull(),
  noticeGiven: timestamp("notice_given", { withTimezone: true }).notNull().defaultNow(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
}, (t) => [index("rent_change_idx").on(t.tenancyId, t.effectiveAt)]);

export const reviews = pgTable("reviews", {
  id: id(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  holdId: uuid("hold_id").notNull().unique().references(() => holds.id), // verified stays only, once each
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
}, (t) => [index("review_prop_idx").on(t.propertyId, t.createdAt)]);

// ─── Trust & safety ──────────────────────────────────────────────────────────
export const flags = pgTable("flags", {
  id: id(),
  kind: flagKindEnum("kind").notNull(),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
  holdId: uuid("hold_id").references(() => holds.id),
  reporterId: uuid("reporter_id").references(() => users.id),
  reason: text("reason").notNull(),
  status: flagStatusEnum("status").notNull().default("OPEN"),
  resolution: text("resolution"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [index("flag_status_idx").on(t.status, t.createdAt)]);

export const savedSpaces = pgTable("saved_spaces", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.propertyId] })]);

// ─── Plumbing ────────────────────────────────────────────────────────────────
// Transactional outbox: SMS/WhatsApp messages are inserted in the same transaction as the state
// change that caused them, then delivered with retries by lib/notify.ts#drainOutbox.
export const outbox = pgTable("outbox", {
  id: id(),
  channel: text("channel").notNull(), // "sms" | "whatsapp"
  to: text("to").notNull(),
  body: text("body").notNull(),
  status: outboxStatusEnum("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index("outbox_due_idx").on(t.status, t.sendAfter)]);

export const auditLog = pgTable("audit_log", {
  id: id(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  meta: jsonb("meta"),
  createdAt: createdAt(),
}, (t) => [
  index("audit_entity_idx").on(t.entity, t.entityId),
  index("audit_created_idx").on(t.createdAt),
]);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // provider event id → duplicate deliveries are no-ops
  provider: text("provider").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations (for db.query.* joins) ───────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  properties: many(properties),
  holds: many(holds),
  visits: many(visits),
}));
export const propertiesRelations = relations(properties, ({ one, many }) => ({
  owner: one(users, { fields: [properties.ownerId], references: [users.id] }),
  units: many(units),
  media: many(media),
  reviews: many(reviews),
}));
export const mediaRelations = relations(media, ({ one }) => ({
  property: one(properties, { fields: [media.propertyId], references: [properties.id] }),
}));
export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, { fields: [units.propertyId], references: [properties.id] }),
  holds: many(holds),
  visits: many(visits),
}));
export const visitsRelations = relations(visits, ({ one }) => ({
  unit: one(units, { fields: [visits.unitId], references: [units.id] }),
  seeker: one(users, { fields: [visits.seekerId], references: [users.id] }),
}));
export const holdsRelations = relations(holds, ({ one, many }) => ({
  unit: one(units, { fields: [holds.unitId], references: [units.id] }),
  seeker: one(users, { fields: [holds.seekerId], references: [users.id] }),
  payments: many(payments),
  tenancy: one(tenancies, { fields: [holds.id], references: [tenancies.holdId] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  hold: one(holds, { fields: [payments.holdId], references: [holds.id] }),
}));
export const tenanciesRelations = relations(tenancies, ({ one, many }) => ({
  hold: one(holds, { fields: [tenancies.holdId], references: [holds.id] }),
  unit: one(units, { fields: [tenancies.unitId], references: [units.id] }),
  tenant: one(users, { fields: [tenancies.tenantId], references: [users.id] }),
  landlord: one(users, { fields: [tenancies.landlordId], references: [users.id] }),
  rentChanges: many(rentChanges),
}));
export const rentChangesRelations = relations(rentChanges, ({ one }) => ({
  tenancy: one(tenancies, { fields: [rentChanges.tenancyId], references: [tenancies.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one }) => ({
  property: one(properties, { fields: [reviews.propertyId], references: [properties.id] }),
}));
export const verificationsRelations = relations(landlordVerifications, ({ one }) => ({
  user: one(users, { fields: [landlordVerifications.userId], references: [users.id] }),
}));
export const payoutsRelations = relations(payouts, ({ one }) => ({
  landlord: one(users, { fields: [payouts.landlordId], references: [users.id] }),
}));
export const flagsRelations = relations(flags, ({ one }) => ({
  property: one(properties, { fields: [flags.propertyId], references: [properties.id] }),
  reporter: one(users, { fields: [flags.reporterId], references: [users.id] }),
}));
