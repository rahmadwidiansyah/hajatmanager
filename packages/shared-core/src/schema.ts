/**
 * Drizzle SQLite schema — mirror Prisma untuk native offline.
 * Keep in sync with prisma/schema.prisma (EventMode, User appPinHash, offline fields).
 * Used by:
 * - Tauri via @tauri-apps/plugin-sql (sqlx sqlite)
 * - Capacitor via @capacitor-community/sqlite
 * - Tests via better-sqlite3
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username"),
  email: text("email").notNull().unique(),
  emailVerified: text("emailVerified"), // ISO string
  image: text("image"),
  avatar: text("avatar"),
  profilePicture: text("profilePicture"),
  password: text("password"),
  appPinHash: text("appPinHash"),
  pinCreatedAt: text("pinCreatedAt"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  namaAcara: text("namaAcara").notNull(),
  namaTuanRumah: text("namaTuanRumah"),
  tanggal: text("tanggal").notNull(), // ISO
  lokasi: text("lokasi"),
  catatan: text("catatan"),
  mejaList: text("mejaList", { mode: "json" }).$type<string[]>().notNull(),
  mode: text("mode").notNull().default("ONLINE"), // ONLINE | OFFLINE
  isOffline: integer("isOffline", { mode: "boolean" }).notNull().default(false),
  localOnly: integer("localOnly", { mode: "boolean" }).notNull().default(false),
  lastSyncAt: text("lastSyncAt"),
  serverId: text("serverId"),
  createdById: text("createdById").notNull(),
  createdAt: text("createdAt").notNull(),
});

export const eventMembers = sqliteTable("eventMembers", {
  id: text("id").primaryKey(),
  eventId: text("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // OWNER | ADMIN | VIEWER
}, (t) => [
  index("idx_eventMembers_userId").on(t.userId),
  index("idx_eventMembers_eventId").on(t.eventId),
]);

export const guestBooks = sqliteTable("guestBooks", {
  id: text("id").primaryKey(),
  eventId: text("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  nama: text("nama").notNull(),
  alamat: text("alamat").notNull(),
  createdAt: text("createdAt").notNull(),
}, (t) => [
  index("idx_guestBooks_eventId_nama").on(t.eventId, t.nama),
]);

export const guests = sqliteTable("guests", {
  id: text("id").primaryKey(),
  eventId: text("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  guestBookId: text("guestBookId"),
  nama: text("nama").notNull(),
  alamat: text("alamat").notNull(),
  nominal: integer("nominal").notNull(),
  metode: text("metode").notNull().default("AMPLOP"),
  catatan: text("catatan"),
  petugasId: text("petugasId").notNull(),
  mejaLabel: text("mejaLabel"),
  kodeInput: text("kodeInput"),
  deviceId: text("deviceId"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  syncStatus: text("syncStatus").notNull().default("pending"), // pending | synced | conflict
}, (t) => [
  index("idx_guests_eventId_nama").on(t.eventId, t.nama),
  index("idx_guests_eventId_alamat").on(t.eventId, t.alamat),
  index("idx_guests_eventId_createdAt").on(t.eventId, t.createdAt),
  index("idx_guests_petugasId").on(t.petugasId),
  index("idx_guests_eventId_meja").on(t.eventId, t.mejaLabel),
]);

export const auditLogs = sqliteTable("auditLogs", {
  id: text("id").primaryKey(),
  eventId: text("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  aksi: text("aksi").notNull(),
  targetId: text("targetId"),
  detail: text("detail", { mode: "json" }),
  createdAt: text("createdAt").notNull(),
  syncStatus: text("syncStatus").notNull().default("pending"),
}, (t) => [
  index("idx_auditLogs_eventId_createdAt").on(t.eventId, t.createdAt),
  index("idx_auditLogs_userId").on(t.userId),
]);

// Sync queue — payload already typed in lib/offline-sync.ts QueuedGuest
export const syncQueue = sqliteTable("syncQueue", {
  id: text("id").primaryKey(),
  action: text("action").notNull(), // CREATE_GUEST | CREATE_GUESTBOOK | UPDATE_EVENT etc
  tableName: text("tableName").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("createdAt").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("lastError"),
});
