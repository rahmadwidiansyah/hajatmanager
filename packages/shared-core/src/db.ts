/**
 * SQLite adapter abstraction — same interface for Tauri, Capacitor, and better-sqlite3 tests.
 * Web fallback remains lib/offline-sync.ts localStorage queue; native will inject real adapter.
 */
export type SqliteAdapter = {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close?(): Promise<void>;
};

export function getAdapter(): SqliteAdapter | null {
  // Detect Tauri
  if (typeof window !== "undefined" && (window as unknown as { __TAURI__?: unknown }).__TAURI__) {
    // Tauri: use @tauri-apps/plugin-sql Database wrapper (create lazily in tauri code)
    // Keep returning null here so lib/offline-sync falls back to localStorage until tauri DB is injected via setAdapter
    return injected ?? null;
  }
  // Detect Capacitor handled similarly via window.Capacitor
  if (typeof window !== "undefined" && (window as unknown as { Capacitor?: unknown }).Capacitor) {
    return injected ?? null;
  }
  return injected ?? null;
}

let injected: SqliteAdapter | null = null;
export function setAdapter(a: SqliteAdapter | null) {
  injected = a;
}

/**
 * SQL to create tables — used by Tauri/Capacitor ensureSchema and by tests.
 * Matches src/schema.ts drizzle definitions.
 */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT, email TEXT NOT NULL UNIQUE,
  emailVerified TEXT, image TEXT, avatar TEXT, profilePicture TEXT,
  password TEXT, appPinHash TEXT, pinCreatedAt TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, namaAcara TEXT NOT NULL, namaTuanRumah TEXT,
  tanggal TEXT NOT NULL, lokasi TEXT, catatan TEXT,
  mejaList TEXT NOT NULL,
  lastSyncAt TEXT, createdById TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eventMembers (
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eventMembers_userId ON eventMembers(userId);
CREATE INDEX IF NOT EXISTS idx_eventMembers_eventId ON eventMembers(eventId);
CREATE TABLE IF NOT EXISTS guestBooks (
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nama TEXT NOT NULL, alamat TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guestBooks_eventId_nama ON guestBooks(eventId, nama);
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guestBookId TEXT, nama TEXT NOT NULL, alamat TEXT NOT NULL,
  nominal INTEGER NOT NULL, metode TEXT NOT NULL DEFAULT 'AMPLOP',
  catatan TEXT, petugasId TEXT NOT NULL, mejaLabel TEXT, kodeInput TEXT, deviceId TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_guests_eventId_nama ON guests(eventId, nama);
CREATE INDEX IF NOT EXISTS idx_guests_eventId_alamat ON guests(eventId, alamat);
CREATE INDEX IF NOT EXISTS idx_guests_eventId_createdAt ON guests(eventId, createdAt);
CREATE TABLE IF NOT EXISTS auditLogs (
  id TEXT PRIMARY KEY, eventId TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  aksi TEXT NOT NULL, targetId TEXT, detail TEXT, createdAt TEXT NOT NULL, syncStatus TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS syncQueue (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, tableName TEXT NOT NULL,
  payload TEXT NOT NULL, createdAt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, lastError TEXT
);
`;
