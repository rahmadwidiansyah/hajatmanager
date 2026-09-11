/**
 * SQLite helper for Android — thin wrapper around @capacitor-community/sqlite
 * Mirrors packages/shared-core schema. Used if Capacitor is present;
 * otherwise web falls back to localStorage queue (lib/offline-sync.ts).
 *
 * DB name must match packages/shared-core/src/db.ts
 */
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";

const DB_NAME = "hajat_manager";
let db: SQLiteDBConnection | null = null;
let sqlite: SQLiteConnection | null = null;

export async function getDb(): Promise<SQLiteDBConnection> {
  if (db) return db;
  sqlite = new SQLiteConnection(CapacitorSQLite);
  // encryption handled via plugin config androidIsEncryption:true
  db = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await db.open();
  await ensureSchema(db);
  return db;
}

async function ensureSchema(c: SQLiteDBConnection) {
  // Minimal schema — mirrors Prisma but keeps web localStorage as fallback
  await c.execute(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offline_queue_eventId ON offline_queue(eventId);
    CREATE TABLE IF NOT EXISTS local_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export async function closeDb() {
  if (db) { await db.close(); db = null; }
  if (sqlite) { await sqlite.closeConnection(DB_NAME, false); sqlite = null; }
}
