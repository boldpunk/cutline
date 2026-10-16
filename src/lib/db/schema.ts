// Drizzle mirror of migrations/*.sql. The SQL migrations are the source of truth
// (they contain exclusion constraints and generated ranges that Drizzle can't express).
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export type SocialLink = { label: string; url: string };

export const salonSettings = pgTable("salon_settings", {
  id: smallint("id").primaryKey().default(1),
  name: text("name").notNull(),
  tagline: text("tagline"),
  about: text("about"),
  address: text("address"),
  mapUrl: text("map_url"),
  phone: text("phone"),
  socials: jsonb("socials").$type<SocialLink[]>().notNull().default([]),
  timezone: text("timezone").notNull(),
  slotStepMin: integer("slot_step_min").notNull(),
  minLeadMin: integer("min_lead_min").notNull(),
  horizonDays: integer("horizon_days").notNull(),
  cancelCutoffHours: integer("cancel_cutoff_hours").notNull(),
  mode: text("mode").$type<"demo" | "live">().notNull(),
  barbersCanBlock: boolean("barbers_can_block").notNull(),
  privacyController: text("privacy_controller"),
  privacyContact: text("privacy_contact"),
  retentionDays: integer("retention_days"),
  consentVersion: text("consent_version").notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  size: integer("size").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const barbers = pgTable("barbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  specialization: text("specialization"),
  bio: text("bio"),
  photoMediaId: uuid("photo_media_id"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  durationMin: integer("duration_min").notNull(),
  priceUzs: bigint("price_uzs", { mode: "number" }).notNull(),
  bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer("buffer_after_min").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const barberServices = pgTable(
  "barber_services",
  {
    barberId: uuid("barber_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    priceUzs: bigint("price_uzs", { mode: "number" }),
    durationMin: integer("duration_min"),
  },
  (t) => [primaryKey({ columns: [t.barberId, t.serviceId] })],
);

export type Role = "admin" | "barber";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull(),
  barberId: uuid("barber_id"),
  active: boolean("active").notNull().default(true),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at").notNull(),
});

export const weeklyAvailability = pgTable("weekly_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  barberId: uuid("barber_id"),
  weekday: smallint("weekday").notNull(),
  startMin: smallint("start_min").notNull(),
  endMin: smallint("end_min").notNull(),
});

export const scheduleExceptions = pgTable("schedule_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  barberId: uuid("barber_id"),
  date: date("date", { mode: "string" }).notNull(),
  kind: text("kind").$type<"closed" | "hours">().notNull(),
  startMin: smallint("start_min"),
  endMin: smallint("end_min"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export type BlockKind = "break" | "vacation" | "other";

export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  barberId: uuid("barber_id").notNull(),
  kind: text("kind").$type<BlockKind>().notNull(),
  startAt: tstz("start_at").notNull(),
  endAt: tstz("end_at").notNull(),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const BOOKING_STATUSES = [
  "confirmed",
  "cancelled_by_client",
  "cancelled_by_staff",
  "completed",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  accessTokenHash: text("access_token_hash").notNull(),
  barberId: uuid("barber_id").notNull(),
  serviceId: uuid("service_id").notNull(),
  serviceName: text("service_name").notNull(),
  priceUzs: bigint("price_uzs", { mode: "number" }).notNull(),
  durationMin: integer("duration_min").notNull(),
  bufferBeforeMin: integer("buffer_before_min").notNull(),
  bufferAfterMin: integer("buffer_after_min").notNull(),
  startAt: tstz("start_at").notNull(),
  endAt: tstz("end_at").notNull(),
  occupiedFrom: tstz("occupied_from").notNull(),
  occupiedUntil: tstz("occupied_until").notNull(),
  status: text("status").$type<BookingStatus>().notNull().default("confirmed"),
  statusReason: text("status_reason"),
  source: text("source").$type<"online" | "staff">().notNull(),
  createdByUserId: uuid("created_by_user_id"),
  rescheduleCount: integer("reschedule_count").notNull().default(0),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const bookingContacts = pgTable("booking_contacts", {
  bookingId: uuid("booking_id").primaryKey(),
  clientName: text("client_name").notNull(),
  phoneE164: text("phone_e164").notNull(),
  phoneLast4: text("phone_last4").notNull(),
  email: text("email"),
  comment: text("comment"),
  consentVersion: text("consent_version").notNull(),
  consentedAt: tstz("consented_at").notNull(),
});

export type BookingEventType =
  | "created"
  | "rescheduled"
  | "cancelled"
  | "completed"
  | "no_show"
  | "access_verified";

export const bookingEvents = pgTable("booking_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: uuid("booking_id").notNull(),
  type: text("type").$type<BookingEventType>().notNull(),
  actorType: text("actor_type").$type<"client" | "staff" | "system">().notNull(),
  actorUserId: uuid("actor_user_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export type NotificationEvent = "booking_confirmed" | "rescheduled" | "cancelled" | "reminder";
export type OutboxStatus = "queued" | "sent" | "failed" | "cancelled";

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull(),
  eventType: text("event_type").$type<NotificationEvent>().notNull(),
  channel: text("channel").$type<"email">().notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").$type<OutboxStatus>().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: tstz("next_attempt_at").notNull().defaultNow(),
  lockedUntil: tstz("locked_until"),
  lastError: text("last_error"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  sentAt: tstz("sent_at"),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    bookingId: uuid("booking_id"),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);
