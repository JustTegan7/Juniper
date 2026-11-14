import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

// Core tables every app needs. Each app adds its own tables below and scopes
// every row to a workspace with a workspace_id column.

const id = () => uuid("id").primaryKey().$defaultFn(() => uuidv7());
const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ---------- Better Auth tables (names and columns follow Better Auth's Drizzle schema) ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // App extras
  timezone: text("timezone"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Core ----------

export const role = pgEnum("role", ["owner", "manager", "member"]);
export const payType = pgEnum("pay_type", ["hourly", "salary"]);

/** A business using the app. Everything else hangs off this id. */
export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    name: text("name").notNull(),
    /** Public link name: /b/<slug>. */
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("America/Los_Angeles"),
    /** Industry preset the workspace was created from ("salon", "spa", "general"...). Sets default words and starter services. */
    template: text("template").notNull().default("general"),
    /** Business settings (booking rules, time clock rules, words, contact). Parsed with workspaceSettingsSchema in @evergreen/core. */
    settings: jsonb("settings").notNull().default({}),
    /** Accent color on the public booking page. */
    brandColor: text("brand_color").notNull().default("#3E4C78"),
    logoUrl: text("logo_url"),
    ...stamps,
  },
  (t) => [uniqueIndex("workspaces_slug").on(t.slug)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: role("role").notNull().default("member"),
    color: text("color").notNull().default("#4FB39C"),
    /** Job title shown to the team and clients ("Senior Stylist", "Front desk"). */
    title: text("title"),
    /** Takes appointments (shows on the calendar and can be booked). */
    bookable: boolean("bookable").notNull().default(true),
    /** Clients can pick this person online. */
    bookableOnline: boolean("bookable_online").notNull().default(true),
    bio: text("bio"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Phone push: new and cancelled bookings. Per person per business, follows them between phones. */
    pushBookings: boolean("push_bookings").notNull().default(true),
    /** Phone push: time off requests (managers) and decisions (the requester). */
    pushTimeOff: boolean("push_time_off").notNull().default(true),
    pushMessages: boolean("push_messages").notNull().default(true),
    /** Pay profile, owners only. Hourly: payRateCents is per hour. Salary: payRateCents is per year. Null means not set. */
    payType: payType("pay_type"),
    payRateCents: integer("pay_rate_cents"),
    ...stamps,
  },
  (t) => [uniqueIndex("memberships_ws_user").on(t.workspaceId, t.userId), index("memberships_user").on(t.userId)],
);

// ---------- Juniper ----------

/** Invite to join a business. The token is only ever stored hashed. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: role("role").notNull().default("member"),
    title: text("title"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [uniqueIndex("invites_token").on(t.tokenHash), index("invites_ws_email").on(t.workspaceId, t.email)],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [index("service_categories_ws").on(t.workspaceId)],
);

/**
 * A bookable service. Time is split so a staff member can take someone else while
 * color processes: active_before (with the client), processing (client waits, staff free),
 * active_after (with the client again), buffer_after (cleanup, staff busy, client gone).
 */
export const services = pgTable(
  "services",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    activeBefore: integer("active_before").notNull().default(30),
    processing: integer("processing").notNull().default(0),
    activeAfter: integer("active_after").notNull().default(0),
    bufferAfter: integer("buffer_after").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    /** Show the price as a starting price ("$60+"). */
    priceFrom: boolean("price_from").notNull().default(false),
    bookableOnline: boolean("bookable_online").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [index("services_ws").on(t.workspaceId)],
);

/** Who performs which service, with optional per-person price and timing (junior and senior stylists). */
export const staffServices = pgTable(
  "staff_services",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents"),
    activeBefore: integer("active_before"),
    processing: integer("processing"),
    activeAfter: integer("active_after"),
    ...stamps,
  },
  (t) => [uniqueIndex("staff_services_pair").on(t.membershipId, t.serviceId), index("staff_services_ws").on(t.workspaceId)],
);

/** When the business is open. Several rows on a weekday allowed. Minutes after midnight. */
export const businessHours = pgTable(
  "business_hours",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    ...stamps,
  },
  (t) => [index("business_hours_ws").on(t.workspaceId)],
);

/** A staff member's usual weekly schedule. */
export const staffHours = pgTable(
  "staff_hours",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    ...stamps,
  },
  (t) => [index("staff_hours_member").on(t.membershipId)],
);

/** A dated change to someone's schedule. Null start and end means off that day. */
export const staffHourOverrides = pgTable(
  "staff_hour_overrides",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    startMin: integer("start_min"),
    endMin: integer("end_min"),
    note: text("note"),
    ...stamps,
  },
  (t) => [index("staff_hour_overrides_member_day").on(t.membershipId, t.day)],
);

export const timeOffStatus = pgEnum("time_off_status", ["pending", "approved", "denied", "cancelled"]);

export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    /** Real instants the person is away. All-day requests run midnight to midnight in the business time zone. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(true),
    /** First and last day, YYYY-MM-DD, for display. */
    startDay: text("start_day").notNull(),
    endDay: text("end_day").notNull(),
    reason: text("reason"),
    status: timeOffStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    ...stamps,
  },
  (t) => [index("time_off_ws_status").on(t.workspaceId, t.status), index("time_off_member").on(t.membershipId)],
);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /** Set when the client signs in to their account with a magic link. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [index("clients_ws_email").on(t.workspaceId, t.email), index("clients_ws_name").on(t.workspaceId, t.lastName, t.firstName)],
);

export const appointmentStatus = pgEnum("appointment_status", ["booked", "confirmed", "checked_in", "completed", "cancelled", "no_show"]);
export const appointmentSource = pgEnum("appointment_source", ["online", "staff"]);

/** One service with one staff member. Several services in one visit share a visit_id. Service details are copied in so later menu changes do not rewrite history. */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id"),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** When the client is done (buffer not included). */
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    activeBefore: integer("active_before").notNull(),
    processing: integer("processing").notNull().default(0),
    activeAfter: integer("active_after").notNull().default(0),
    bufferAfter: integer("buffer_after").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    status: appointmentStatus("status").notNull().default("booked"),
    source: appointmentSource("source").notNull().default("staff"),
    clientNote: text("client_note"),
    staffNote: text("staff_note"),
    /** Hash of the secret in the client's manage link. */
    manageTokenHash: text("manage_token_hash"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    index("appointments_ws_start").on(t.workspaceId, t.startsAt),
    index("appointments_member_start").on(t.membershipId, t.startsAt),
    index("appointments_client").on(t.clientId),
    uniqueIndex("appointments_manage_token").on(t.manageTokenHash),
  ],
);

/**
 * The stretches when an appointment's staff member is busy. Derived from the
 * appointment (rewritten on every change, removed on cancel). A Postgres exclusion
 * constraint (migration 0002) stops two of them overlapping for one person, so two
 * clients can never grab the same time even at the same instant.
 */
export const appointmentSegments = pgTable(
  "appointment_segments",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Staff chose to double book on purpose. Skipped by the overlap constraint. */
    allowOverlap: boolean("allow_overlap").notNull().default(false),
  },
  (t) => [index("appointment_segments_member").on(t.membershipId, t.startsAt), index("appointment_segments_appt").on(t.appointmentId)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    note: text("note"),
    /** Set when a manager changes the times. The audit log keeps the before and after. */
    editedBy: text("edited_by").references(() => user.id, { onDelete: "set null" }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("time_entries_member_in").on(t.membershipId, t.clockIn), index("time_entries_ws_in").on(t.workspaceId, t.clockIn)],
);

export const breakKind = pgEnum("break_kind", ["meal", "rest"]);

export const timeBreaks = pgTable(
  "time_breaks",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => timeEntries.id, { onDelete: "cascade" }),
    kind: breakKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("time_breaks_entry").on(t.entryId)],
);

/** Who changed what. Written by services for edits that matter (timesheets, time off, appointments, settings). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_ws_entity").on(t.workspaceId, t.entity, t.entityId), index("audit_log_ws_created").on(t.workspaceId, t.createdAt)],
);

/**
 * Expo push tokens for the phone app. One row per token: the same phone can sign in as someone else or
 * switch business, which moves the row. A removed token keeps its row with deleted_at set.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Latest Expo ticket id, checked later for DeviceNotRegistered receipts. */
    ticketId: text("ticket_id"),
    ticketAt: timestamp("ticket_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [uniqueIndex("push_tokens_token").on(t.token), index("push_tokens_member").on(t.workspaceId, t.membershipId)],
);

// ---------- Storefront, inventory and Helcim payments ----------
// See docs/storefront-spec.md. Money is whole cents. Stock is a ledger: on hand is the sum of stock_movements.delta.

export const orderChannel = pgEnum("order_channel", ["in_person", "online"]);
export const orderStatus = pgEnum("order_status", ["draft", "awaiting_payment", "paid", "fulfilled", "cancelled", "refunded"]);
export const fulfillmentKind = pgEnum("fulfillment_kind", ["counter", "pickup", "ship"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "approved", "declined", "cancelled", "timed_out", "refunded"]);
export const stockReason = pgEnum("stock_reason", ["receive", "sale", "online_sale", "adjust", "return", "void"]);
export const helcimDeviceKind = pgEnum("helcim_device_kind", ["smart_terminal", "card_reader"]);

/** A flat SKU (no variants). Stock is not a column here, see stockMovements. */
export const products = pgTable(
  "products",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    shippingAllowed: boolean("shipping_allowed").notNull().default(true),
    pickupAllowed: boolean("pickup_allowed").notNull().default(true),
    /** Image URLs, first one is the main photo. */
    images: jsonb("images").notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [uniqueIndex("products_ws_sku").on(t.workspaceId, t.sku), index("products_ws_active").on(t.workspaceId, t.active)],
);

/** Append only. Fix a mistake with a new row, never by editing or deleting one. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: stockReason("reason").notNull(),
    orderId: uuid("order_id"),
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_product").on(t.workspaceId, t.productId),
    index("stock_movements_order").on(t.orderId),
    // One row per order, product and reason, so a replayed webhook can never take stock out twice.
    // Returns are exempt, since one order can be returned in several parts.
    uniqueIndex("stock_movements_order_product_reason").on(t.orderId, t.productId, t.reason).where(sql`order_id is not null and reason <> 'return'`),
  ],
);

/** Hands out the next human order number for a business. Used as the Helcim invoiceNumber. */
export const orderCounters = pgTable("order_counters", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  next: integer("next").notNull().default(1),
});

export const orders = pgTable(
  "orders",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderNumber: integer("order_number").notNull(),
    channel: orderChannel("channel").notNull(),
    status: orderStatus("status").notNull().default("draft"),
    fulfillment: fulfillmentKind("fulfillment").notNull().default("counter"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    /** Shipping address for ship orders. */
    shipTo: jsonb("ship_to"),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [uniqueIndex("orders_ws_number").on(t.workspaceId, t.orderNumber), index("orders_ws_status").on(t.workspaceId, t.status)],
);

/** Name, SKU and price are copied at sale time so later product edits never change a past order. */
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    ...stamps,
  },
  (t) => [index("order_items_order").on(t.orderId)],
);

/** Per business Helcim account link. Tokens are stored encrypted. The partner token is a deploy setting, not stored here. */
export const helcimConnections = pgTable(
  "helcim_connections",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** Random URL-safe key used in the webhook path so each Helcim account gets its own verifier token. */
    connectionKey: text("connection_key").notNull(),
    apiTokenEnc: text("api_token_enc").notNull(),
    verifierTokenEnc: text("verifier_token_enc"),
    currency: text("currency").notNull().default("USD"),
    ...stamps,
  },
  (t) => [uniqueIndex("helcim_connections_ws").on(t.workspaceId), uniqueIndex("helcim_connections_key").on(t.connectionKey)],
);

export const helcimDevices = pgTable(
  "helcim_devices",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => helcimConnections.id, { onDelete: "cascade" }),
    /** The 4 character device code shown on the device after registering. */
    code: text("code").notNull(),
    kind: helcimDeviceKind("kind").notNull(),
    label: text("label").notNull(),
    location: text("location"),
    active: boolean("active").notNull().default(true),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [uniqueIndex("helcim_devices_conn_code").on(t.connectionId, t.code)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    channel: orderChannel("channel").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    deviceId: uuid("device_id").references(() => helcimDevices.id, { onDelete: "set null" }),
    /** 25 character key sent as the Helcim idempotency-key header. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Set when Helcim reports the transaction. Unique so a replayed webhook cannot pay twice. */
    helcimTransactionId: text("helcim_transaction_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Set when the match used the fallback (device and amount) instead of the invoice number. */
    needsReview: boolean("needs_review").notNull().default(false),
    raw: jsonb("raw"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("payments_idem").on(t.idempotencyKey),
    uniqueIndex("payments_txn").on(t.helcimTransactionId),
    index("payments_order").on(t.orderId),
    index("payments_ws_status").on(t.workspaceId, t.status),
    // One pending payment per device at a time. Helcim has no queue for a device.
    uniqueIndex("payments_one_pending_per_device").on(t.deviceId).where(sql`status = 'pending' and device_id is not null`),
  ],
);

export const refundMethod = pgEnum("refund_method", ["cash", "card"]);
export const refundStatus = pgEnum("refund_status", ["pending", "approved", "failed"]);

/**
 * Money going back to a customer. Pending means a card refund was sent and the answer is unknown: check Helcim
 * before retrying. Items are copied here so the order page can show what is left to return.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    method: refundMethod("method").notNull(),
    status: refundStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    /** The tax and shipping parts of amountCents. The rest is the items. */
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    /** [{ orderItemId, productId, quantity }] */
    items: jsonb("items").notNull().default([]),
    restock: boolean("restock").notNull().default(true),
    reason: text("reason").notNull(),
    /** Sent as the Helcim idempotency-key header, so a retry can never refund twice. */
    idempotencyKey: text("idempotency_key").notNull(),
    helcimTransactionId: text("helcim_transaction_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    raw: jsonb("raw"),
    ...stamps,
  },
  (t) => [uniqueIndex("refunds_idem").on(t.idempotencyKey), index("refunds_order").on(t.orderId)],
);

/** Every webhook delivery, deduped on Helcim's webhook-id. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    webhookId: text("webhook_id").notNull(),
    type: text("type").notNull(),
    helcimId: text("helcim_id"),
    result: text("result"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("webhook_events_webhook_id").on(t.webhookId)],
);

// ---- Team chat (docs/team-chat-spec.md) ----

export const conversationKind = pgEnum("conversation_kind", ["group", "direct"]);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: conversationKind("kind").notNull(),
    /** Name of a group. Null for direct messages. */
    title: text("title"),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    ...stamps,
  },
  (t) => [index("conversations_ws_last").on(t.workspaceId, t.lastMessageAt)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    muted: boolean("muted").notNull().default(false),
    ...stamps,
  },
  (t) => [uniqueIndex("conversation_members_pair").on(t.conversationId, t.membershipId), index("conversation_members_membership").on(t.membershipId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderMembershipId: uuid("sender_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    /** Set on a reply. Points at a top level message in the same conversation. */
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    ...stamps,
  },
  (t) => [index("messages_conversation_created").on(t.conversationId, t.createdAt), index("messages_parent").on(t.parentId)],
);
