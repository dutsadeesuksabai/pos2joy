// Core schema; generate and review migrations before use. All tables deny client
// access through RLS. Server queries must verify identity and tenant permissions.
import { pgTable, uuid, text, integer, timestamp, unique, foreignKey, jsonb, check, uniqueIndex, index, boolean, date } from "drizzle-orm/pg-core";
import type { FloorCanvas } from "../features/floor/model";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const organizations = pgTable("organizations", {
  id: id(), name: text("name").notNull(), createdAt: createdAt(),
}).enableRLS();

export const memberships = pgTable("organization_memberships", {
  id: id(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull(), role: text("role", { enum: ["owner", "member"] }).notNull(),
}, t => [index("membership_user_org_idx").on(t.userId, t.organizationId), unique().on(t.organizationId, t.userId), check("membership_role_valid", sql`${t.role} in ('owner', 'member')`)]).enableRLS();

export const restaurants = pgTable("restaurants", {
  id: id(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), slug: text("slug").notNull().unique(),
}, t => [unique().on(t.id, t.organizationId)]).enableRLS();

export const branches = pgTable("branches", {
  id: id(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  restaurantId: uuid("restaurant_id").notNull(), name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Bangkok"), currency: text("currency").notNull().default("THB"),
}, t => [index("branch_org_idx").on(t.organizationId), unique().on(t.id, t.organizationId), foreignKey({ columns: [t.restaurantId, t.organizationId], foreignColumns: [restaurants.id, restaurants.organizationId] })]).enableRLS();

export const branchStaff = pgTable("branch_staff", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), userId: uuid("user_id").notNull(),
  role: text("role", { enum: ["manager", "host", "server", "kitchen", "cashier"] }).notNull(),
}, t => [
  unique().on(t.branchId, t.userId),
  foreignKey({ columns: [t.branchId, t.organizationId], foreignColumns: [branches.id, branches.organizationId] }),
  foreignKey({ columns: [t.organizationId, t.userId], foreignColumns: [memberships.organizationId, memberships.userId] }),
  check("branch_staff_role_valid", sql`${t.role} in ('manager', 'host', 'server', 'kitchen', 'cashier')`),
]).enableRLS();

export const floors = pgTable("floors", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), name: text("name").notNull(),
  revision: integer("revision").notNull().default(0),
}, t => [unique().on(t.branchId, t.name), check("floor_revision_nonnegative", sql`${t.revision} >= 0`), unique().on(t.id, t.branchId, t.organizationId), foreignKey({ columns: [t.branchId, t.organizationId], foreignColumns: [branches.id, branches.organizationId] })]).enableRLS();

export const layoutVersions = pgTable("layout_versions", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), floorId: uuid("floor_id").notNull(),
  version: integer("version").notNull(), state: text("state", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  canvas: jsonb("canvas").$type<FloorCanvas>().notNull(), createdAt: createdAt(),
}, t => [
  unique().on(t.floorId, t.version),
  uniqueIndex("one_published_layout_per_floor").on(t.floorId).where(sql`${t.state} = 'published'`),
  uniqueIndex("one_draft_layout_per_floor").on(t.floorId).where(sql`${t.state} = 'draft'`),
  check("layout_version_positive", sql`${t.version} > 0`),
  check("layout_state_valid", sql`${t.state} in ('draft', 'published', 'archived')`),
  foreignKey({ columns: [t.floorId, t.branchId, t.organizationId], foreignColumns: [floors.id, floors.branchId, floors.organizationId] }),
]).enableRLS();

export const diningTables = pgTable("dining_tables", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), label: text("label").notNull(), capacity: integer("capacity").notNull(),
  floorId: uuid("floor_id").notNull(), accessible: boolean("accessible").notNull().default(false), enabled: boolean("enabled").notNull().default(true),
  state: text("state", { enum: ["available", "occupied", "reserved", "held"] }).notNull().default("available"),
}, t => [
  unique().on(t.branchId, t.label), unique().on(t.id, t.branchId, t.organizationId), check("capacity_positive", sql`${t.capacity} > 0`),
  check("table_state_valid", sql`${t.state} in ('available', 'occupied', 'reserved', 'held')`),
  check("disabled_table_available", sql`${t.enabled} or ${t.state} = 'available'`),
  foreignKey({ columns: [t.floorId, t.branchId, t.organizationId], foreignColumns: [floors.id, floors.branchId, floors.organizationId] }),
  foreignKey({ columns: [t.branchId, t.organizationId], foreignColumns: [branches.id, branches.organizationId] }),
]).enableRLS();

export const queueEntries = pgTable("queue_entries", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), guestName: text("guest_name").notNull(), partySize: integer("party_size").notNull(),
  status: text("status", { enum: ["waiting", "offered", "seated", "cancelled", "no_show"] }).notNull().default("waiting"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  needsAccessible: boolean("needs_accessible").notNull().default(false),
  requestedFloorId: uuid("requested_floor_id"),
  seatedTableId: uuid("seated_table_id"),
  seatedAt: timestamp("seated_at", { withTimezone: true }),
  seatedBy: uuid("seated_by"),
  seatingReason: text("seating_reason"),
  // Queue numbers restart each service day, which is the branch calendar day.
  // Unique per day, so two hosts adding at once cannot share a number.
  serviceDay: date("service_day").notNull(),
  ticketNo: integer("ticket_no").notNull(),
  // Calling a party holds a table for them and puts them on the call display.
  calledAt: timestamp("called_at", { withTimezone: true }),
  calledTableId: uuid("called_table_id"),
}, t => [
  unique().on(t.id, t.branchId, t.organizationId),
  unique().on(t.branchId, t.serviceDay, t.ticketNo),
  index("queue_branch_status_wait_idx").on(t.branchId, t.organizationId, t.status, t.joinedAt),
  check("ticket_no_positive", sql`${t.ticketNo} > 0`),
  check("party_size_positive", sql`${t.partySize} > 0`), check("queue_status_valid", sql`${t.status} in ('waiting', 'offered', 'seated', 'cancelled', 'no_show')`),
  foreignKey({ columns: [t.branchId, t.organizationId], foreignColumns: [branches.id, branches.organizationId] }),
  foreignKey({ name: "queue_requested_floor_tenant_fk", columns: [t.requestedFloorId, t.branchId, t.organizationId], foreignColumns: [floors.id, floors.branchId, floors.organizationId] }),
  foreignKey({ name: "queue_seated_table_tenant_fk", columns: [t.seatedTableId, t.branchId, t.organizationId], foreignColumns: [diningTables.id, diningTables.branchId, diningTables.organizationId] }),
  foreignKey({ name: "queue_called_table_tenant_fk", columns: [t.calledTableId, t.branchId, t.organizationId], foreignColumns: [diningTables.id, diningTables.branchId, diningTables.organizationId] }),
  check("queue_called_together", sql`(${t.calledAt} is null) = (${t.calledTableId} is null)`),
]).enableRLS();

export const queueSeatingEvents = pgTable("queue_seating_events", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(),
  tableId: uuid("table_id").notNull(), queueEntryId: uuid("queue_entry_id"), actorId: uuid("actor_id").notNull(),
  decision: text("decision", { enum: ["recommended", "override", "walk_in"] }).notNull(),
  reason: text("reason").notNull(), createdAt: createdAt(),
}, t => [
  check("queue_seating_decision_valid", sql`${t.decision} in ('recommended', 'override', 'walk_in')`),
  foreignKey({ name: "queue_event_table_tenant_fk", columns: [t.tableId, t.branchId, t.organizationId], foreignColumns: [diningTables.id, diningTables.branchId, diningTables.organizationId] }),
  foreignKey({ name: "queue_event_entry_tenant_fk", columns: [t.queueEntryId, t.branchId, t.organizationId], foreignColumns: [queueEntries.id, queueEntries.branchId, queueEntries.organizationId] }),
]).enableRLS();

// The QR sticker on a table encodes its random table ID; no separate token table.
// Ordering is gated on the table being seated, so a photographed code is useless
// once the party leaves. Money is integer minor units in the branch currency.
export const menuItems = pgTable("menu_items", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(), category: text("category").notNull(), priceCents: integer("price_cents").notNull(),
  kind: text("kind", { enum: ["a_la_carte", "buffet"] }).notNull().default("a_la_carte"),
  available: boolean("available").notNull().default(true), sortOrder: integer("sort_order").notNull().default(0),
}, t => [
  unique().on(t.branchId, t.name), unique().on(t.id, t.branchId, t.organizationId),
  check("menu_price_nonnegative", sql`${t.priceCents} >= 0`),
  index("menu_branch_sort_idx").on(t.branchId, t.organizationId, t.sortOrder, t.name),
  check("menu_kind_valid", sql`${t.kind} in ('a_la_carte', 'buffet')`),
  foreignKey({ columns: [t.branchId, t.organizationId], foreignColumns: [branches.id, branches.organizationId] }),
]).enableRLS();

export const orders = pgTable("orders", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(), tableId: uuid("table_id").notNull(),
  status: text("status", { enum: ["placed", "preparing", "served", "cancelled"] }).notNull().default("placed"),
  createdAt: createdAt(),
  // Stamped as the ticket moves, so service time is measured rather than guessed.
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  servedAt: timestamp("served_at", { withTimezone: true }),
}, t => [
  unique().on(t.id, t.branchId, t.organizationId),
  check("order_status_valid", sql`${t.status} in ('placed', 'preparing', 'served', 'cancelled')`),
  index("orders_branch_status_created_idx").on(t.branchId, t.organizationId, t.status, t.createdAt),
  index("orders_table_status_created_idx").on(t.tableId, t.branchId, t.organizationId, t.status, t.createdAt),
  foreignKey({ columns: [t.tableId, t.branchId, t.organizationId], foreignColumns: [diningTables.id, diningTables.branchId, diningTables.organizationId] }),
]).enableRLS();

// Name and price are snapshotted so editing the menu never rewrites past bills.
export const orderItems = pgTable("order_items", {
  id: id(), organizationId: uuid("organization_id").notNull(), branchId: uuid("branch_id").notNull(),
  orderId: uuid("order_id").notNull(), menuItemId: uuid("menu_item_id").notNull(),
  name: text("name").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), quantity: integer("quantity").notNull(),
}, t => [
  unique().on(t.orderId, t.menuItemId),
  check("order_item_quantity_positive", sql`${t.quantity} > 0`),
  check("order_item_price_nonnegative", sql`${t.unitPriceCents} >= 0`),
  foreignKey({ columns: [t.orderId, t.branchId, t.organizationId], foreignColumns: [orders.id, orders.branchId, orders.organizationId] }),
  foreignKey({ columns: [t.menuItemId, t.branchId, t.organizationId], foreignColumns: [menuItems.id, menuItems.branchId, menuItems.organizationId] }),
]).enableRLS();
