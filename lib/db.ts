"use client";
// Web 100% Online-Only — IndexedDB & Local Storage Read-Cache dinonaktifkan.

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

// Hapus database Dexie jika pernah dibuat sebelumnya
if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  try {
    indexedDB.deleteDatabase("hajatmanager");
  } catch {}
}

export function getDb(): null {
  return null;
}

// ---------- kv ----------
export async function kvGet(_key: string): Promise<string | null> {
  return null;
}

export async function kvSet(_key: string, _value: string): Promise<void> {
  // no-op
}

// ---------- outbox ----------
export async function outboxAdd(_op: Omit<OutboxOp, "attempts" | "createdAt"> & { attempts?: number; createdAt?: string }): Promise<void> {
  // no-op
}

export async function outboxList(_eventId: string): Promise<OutboxOp[]> {
  return [];
}

export async function outboxCount(_eventId: string): Promise<number> {
  return 0;
}

export async function outboxCountAll(): Promise<number> {
  return 0;
}

export async function outboxRemove(_ids: string[]): Promise<void> {
  // no-op
}

export async function outboxBump(_id: string, _lastError: string): Promise<void> {
  // no-op
}

export async function outboxUpdate(_id: string, _patch: Partial<OutboxOp>): Promise<void> {
  // no-op
}

export async function outboxClear(_eventId: string): Promise<void> {
  // no-op
}

// ---------- read cache (disabled) ----------
export async function putCachedGuests(_eventId: string, _guests: Record<string, unknown>[]): Promise<void> {
  // no-op
}

export async function getCachedGuests(_eventId: string): Promise<Record<string, unknown>[]> {
  return [];
}

export async function putCachedBooks(_eventId: string, _books: Record<string, unknown>[]): Promise<void> {
  // no-op
}

export async function getCachedBooks(_eventId: string): Promise<Record<string, unknown>[]> {
  return [];
}

export async function putCachedEvent(_event: Record<string, unknown> & { id: string }): Promise<void> {
  // no-op
}

export async function getCachedEvent(_eventId: string): Promise<Record<string, unknown> | null> {
  return null;
}

export async function listCachedEvents(): Promise<{ id: string; namaAcara: string }[]> {
  return [];
}
