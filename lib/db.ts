"use client";
// Fase 2: Dexie (IndexedDB) sebagai store offline utama.
// - outbox: antrean generik SEMUA mutasi (bukan cuma CREATE_GUEST)
// - guestsCache / booksCache / eventsCache / kv: read-cache agar halaman tetap tampil offline
// Semua helper tahan gagal (SSR / IndexedDB diblokir) → fallback diam ke []/null.

import Dexie, { type Table } from "dexie";

export type OutboxAction =
  | "CREATE_EVENT"
  | "CREATE_GUEST"
  | "UPDATE_GUEST"
  | "DELETE_GUEST"
  | "CREATE_BOOK"
  | "UPDATE_BOOK"
  | "DELETE_BOOK"
  | "UPDATE_EVENT"
  | "ADD_MEMBER"
  | "REMOVE_MEMBER";

export type OutboxOp = {
  id: string;
  eventId: string;
  action: OutboxAction;
  tableName: "guests" | "guestBooks" | "events" | "members";
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
};

type GuestCacheRow = { id: string; eventId: string; data: Record<string, unknown>; updatedAt: string };
type BookCacheRow = { id: string; eventId: string; data: Record<string, unknown>; updatedAt: string };
type EventCacheRow = { id: string; data: Record<string, unknown>; updatedAt: string };
type KvRow = { key: string; value: string; updatedAt: string };

class HajatDb extends Dexie {
  outbox!: Table<OutboxOp, string>;
  guestsCache!: Table<GuestCacheRow, string>;
  booksCache!: Table<BookCacheRow, string>;
  eventsCache!: Table<EventCacheRow, string>;
  kv!: Table<KvRow, string>;

  constructor() {
    super("hajatmanager");
    this.version(1).stores({
      outbox: "id, eventId, createdAt",
      guestsCache: "id, eventId",
      booksCache: "id, eventId",
      eventsCache: "id",
      kv: "key",
    });
  }
}

let db: HajatDb | null = null;

export function getDb(): HajatDb | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  try {
    if (!db) db = new HajatDb();
    return db;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- kv ----------
export async function kvGet(key: string): Promise<string | null> {
  const d = getDb();
  if (!d) {
    try {
      return localStorage.getItem(`dexkv:${key}`);
    } catch {
      return null;
    }
  }
  try {
    const row = await d.kv.get(key);
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  const d = getDb();
  if (!d) {
    try {
      localStorage.setItem(`dexkv:${key}`, value);
    } catch {}
    return;
  }
  try {
    await d.kv.put({ key, value, updatedAt: nowIso() });
  } catch {}
}

// ---------- outbox ----------
export async function outboxAdd(op: Omit<OutboxOp, "attempts" | "createdAt"> & { attempts?: number; createdAt?: string }): Promise<void> {
  const d = getDb();
  const row: OutboxOp = {
    attempts: 0,
    createdAt: nowIso(),
    ...op,
    lastError: op.lastError ?? null,
  } as OutboxOp;
  if (!d) return;
  try {
    await d.outbox.put(row);
  } catch {}
}

export async function outboxList(eventId: string): Promise<OutboxOp[]> {
  const d = getDb();
  if (!d) return [];
  try {
    return await d.outbox.where("eventId").equals(eventId).sortBy("createdAt");
  } catch {
    return [];
  }
}

export async function outboxCount(eventId: string): Promise<number> {
  const d = getDb();
  if (!d) return 0;
  try {
    return await d.outbox.where("eventId").equals(eventId).count();
  } catch {
    return 0;
  }
}

export async function outboxCountAll(): Promise<number> {
  const d = getDb();
  if (!d) return 0;
  try {
    return await d.outbox.count();
  } catch {
    return 0;
  }
}

export async function outboxRemove(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const d = getDb();
  if (!d) return;
  try {
    await d.outbox.bulkDelete(ids);
  } catch {}
}

export async function outboxBump(id: string, lastError: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const cur = await d.outbox.get(id);
    if (!cur) return;
    await d.outbox.update(id, { attempts: (cur.attempts || 0) + 1, lastError });
  } catch {}
}

/** Fase 5: patch op (mis. isi catatan resolusi + reset attempts). */
export async function outboxUpdate(id: string, patch: Partial<OutboxOp>): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    await d.outbox.update(id, patch);
  } catch {}
}

export async function outboxClear(eventId: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    await d.outbox.where("eventId").equals(eventId).delete();
  } catch {}
}

// ---------- read cache ----------
export async function putCachedGuests(eventId: string, guests: Record<string, unknown>[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const t = nowIso();
    await d.guestsCache.where("eventId").equals(eventId).delete();
    if (guests.length) {
      await d.guestsCache.bulkPut(
        guests
          .filter((g) => g && typeof (g as { id?: unknown }).id === "string")
          .map((g) => ({ id: (g as { id: string }).id, eventId, data: g, updatedAt: t }))
      );
    }
  } catch {}
}

export async function getCachedGuests(eventId: string): Promise<Record<string, unknown>[]> {
  const d = getDb();
  if (!d) return [];
  try {
    const rows = await d.guestsCache.where("eventId").equals(eventId).toArray();
    return rows.map((r) => r.data);
  } catch {
    return [];
  }
}

export async function putCachedBooks(eventId: string, books: Record<string, unknown>[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const t = nowIso();
    await d.booksCache.where("eventId").equals(eventId).delete();
    if (books.length) {
      await d.booksCache.bulkPut(
        books
          .filter((b) => b && typeof (b as { id?: unknown }).id === "string")
          .map((b) => ({ id: (b as { id: string }).id, eventId, data: b, updatedAt: t }))
      );
    }
  } catch {}
}

export async function getCachedBooks(eventId: string): Promise<Record<string, unknown>[]> {
  const d = getDb();
  if (!d) return [];
  try {
    const rows = await d.booksCache.where("eventId").equals(eventId).toArray();
    return rows.map((r) => r.data);
  } catch {
    return [];
  }
}

export async function putCachedEvent(event: Record<string, unknown> & { id: string }): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    await d.eventsCache.put({ id: event.id, data: event, updatedAt: nowIso() });
  } catch {}
}

export async function getCachedEvent(eventId: string): Promise<Record<string, unknown> | null> {
  const d = getDb();
  if (!d) return null;
  try {
    const row = await d.eventsCache.get(eventId);
    return row ? row.data : null;
  } catch {
    return null;
  }
}

/** Fase 4: daftar semua acara yang ter-cache (untuk fallback offline). */
export async function listCachedEvents(): Promise<{ id: string; namaAcara: string }[]> {
  const d = getDb();
  if (!d) return [];
  try {
    const rows = await d.eventsCache.toArray();
    return rows.map((r) => ({
      id: r.id,
      namaAcara: typeof r.data.namaAcara === "string" ? r.data.namaAcara : r.id,
    }));
  } catch {
    return [];
  }
}
