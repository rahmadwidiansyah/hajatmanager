"use client";

import {
  kvGet,
  kvSet,
  outboxAdd,
  outboxList,
  outboxCount,
  outboxRemove,
  outboxBump,
  outboxUpdate,
  putCachedGuests,
  putCachedBooks,
  putCachedEvent,
  type OutboxAction,
  type OutboxOp,
} from "./db";

export type { OutboxAction, OutboxOp };

// Lightweight background sync foundation for web.
// - Queue format: localStorage `offlineQueue:${eventId}` JSON array (web fallback)
// - Fase 1: flush tahan gagal (timeout + try/catch + reachability), auto-push 1 menit + backoff,
//   status jaringan real via subscribeNetworkStatus(). Bukan SW/PWA penuh (Fase 3).
// - Fase 2: Dexie outbox generik (semua mutasi) + read-cache + pull delta. LS jadi fallback/migrasi.
// - Manual flush via `flushOfflineQueue(eventId)`

export const SYNC_INTERVAL_MS = 60 * 1000; // Fase 1: 1 menit (dulu 30 mnt, kelamaan untuk kasir hajatan)
export const FLUSH_TIMEOUT_MS = 12_000;
export const REACH_TIMEOUT_MS = 5_000;
export const MAX_BACKOFF_MS = 10 * 60 * 1000;
export const QUEUE_KEY = (eventId: string) => `offlineQueue:${eventId}`;
export const LAST_SYNC_KEY = (eventId: string) => `lastSyncAt:${eventId}`;
export const AUTOSYNC_KEY = (eventId: string) => `autoSync:${eventId}`;
export const INTERVAL_KEY = (eventId: string) => `autoSyncInterval:${eventId}`;
const FAIL_KEY = (eventId: string) => `offlineFailCount:${eventId}`;
const LAST_TRY_KEY = (eventId: string) => `offlineLastTry:${eventId}`;

export type QueuedGuest = {
  id: string;
  eventId: string;
  nama: string;
  alamat: string;
  nominal: number;
  metode: string;
  catatan?: string | null;
  mejaLabel?: string | null;
  kodeInput?: string | null;
  deviceId?: string | null;
  // localId: UUID v4 murni yang digenerate client saat buat data.
  // Kunci idempoten — server lookup by localId sebelum insert,
  // sehingga retry / flush ganda tidak menghasilkan baris dobel.
  localId?: string | null;
  createdAt: string;
};

let sqliteAdapter: { exec?: (sql: string, params?: unknown[]) => Promise<void>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> } | null = null;

export function setSqliteAdapter(a: unknown) {
  sqliteAdapter = a as typeof sqliteAdapter;
}

export function hasSqliteAdapter() {
  return !!sqliteAdapter;
}

// localStorage helpers (web fallback)
function getQueueLS(eventId: string): QueuedGuest[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY(eventId));
    return raw ? (JSON.parse(raw) as QueuedGuest[]) : [];
  } catch {
    return [];
  }
}
function setQueueLS(eventId: string, items: QueuedGuest[]) {
  try {
    localStorage.setItem(QUEUE_KEY(eventId), JSON.stringify(items));
  } catch {}
}

export function getQueue(eventId: string): QueuedGuest[] {
  // Native SQLite path is async — for sync getQueue we return LS cache
  // Native code should use getQueueAsync() if it injected adapter
  return getQueueLS(eventId);
}

export function setQueue(eventId: string, items: QueuedGuest[]) {
  setQueueLS(eventId, items);
}

export async function getQueueAsync(eventId: string): Promise<QueuedGuest[]> {
  if (sqliteAdapter?.query) {
    try {
      const rows = (await sqliteAdapter.query("SELECT payload FROM syncQueue WHERE tableName='guests' AND json_extract(payload,'$.eventId')=?", [eventId])) as { payload: string }[];
      return rows.map((r) => JSON.parse(typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload)) as QueuedGuest);
    } catch { return getQueueLS(eventId); }
  }
  return getQueueLS(eventId);
}

export function enqueueGuest(eventId: string, g: QueuedGuest) {
  const q = getQueueLS(eventId);
  q.push(g);
  setQueueLS(eventId, q);
  if (sqliteAdapter?.exec) {
    // also persist to SQLite syncQueue (best effort, non-blocking)
    sqliteAdapter.exec("INSERT OR REPLACE INTO syncQueue (id, action, tableName, payload, createdAt, attempts) VALUES (?,?,?,?,?,0)", [g.id, "CREATE_GUEST", "guests", JSON.stringify(g), g.createdAt]).catch(() => {});
  }
  try {
    window.dispatchEvent(new CustomEvent("offline-queue-changed", { detail: { eventId, count: q.length } }));
  } catch {}
  return q.length;
}

export function getPendingCount(eventId: string) {
  return getQueueLS(eventId).length;
}

export async function getPendingCountAsync(eventId: string): Promise<number> {
  if (sqliteAdapter?.query) {
    try {
      const rows = (await sqliteAdapter.query("SELECT COUNT(*) as c FROM syncQueue WHERE tableName='guests' AND json_extract(payload,'$.eventId')=?", [eventId])) as { c: number }[];
      return rows[0]?.c ?? getPendingCount(eventId);
    } catch { return getPendingCount(eventId); }
  }
  return getPendingCount(eventId);
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function logOffline(...args: unknown[]) {
  try {
    // Fase 0: instrumentasi — filter di DevTools dengan "[offline]"
    // eslint-disable-next-line no-console
    console.debug("[offline]", ...args);
  } catch {}
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function getFailCount(eventId: string): number {
  try {
    return Number(localStorage.getItem(FAIL_KEY(eventId)) || 0) || 0;
  } catch {
    return 0;
  }
}

function setFailCount(eventId: string, n: number) {
  try {
    localStorage.setItem(FAIL_KEY(eventId), String(n));
    localStorage.setItem(LAST_TRY_KEY(eventId), new Date().toISOString());
  } catch {}
}

function resetFailCount(eventId: string) {
  try {
    localStorage.removeItem(FAIL_KEY(eventId));
  } catch {}
}

export function getBackoffDelayMs(eventId: string): number {
  const fails = getFailCount(eventId);
  if (fails <= 0) return SYNC_INTERVAL_MS;
  return Math.min(SYNC_INTERVAL_MS * 2 ** Math.min(fails, 5), MAX_BACKOFF_MS);
}

/** Cek koneksi beneran ke server (navigator.onLine sering menipu saat captive portal). */
export async function checkReachability(timeoutMs = REACH_TIMEOUT_MS): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const res = await fetchWithTimeout(`/api/health?t=${Date.now()}`, { method: "GET", cache: "no-store" }, timeoutMs);
    return res.ok;
  } catch {
    return false;
  }
}

/** Subscribe status jaringan real (online/offline event). Return unsubscribe. */
export function subscribeNetworkStatus(cb: (online: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

export type FlushResult = { flushed: number; conflicts: number; error?: string };

export function newOpId(prefix = "op"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  } catch {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate UUID v4 murni untuk localId.
 * Tidak pakai prefix agar bisa dipakai sebagai id sementara di SQLite lokal
 * dan dikenali server sebagai non-CUID (beda format = mudah di-debug).
 */
export function newLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Fase 2: enqueue generik ke Dexie outbox (+ mirror SQLite native best-effort). */
export async function enqueueOp(eventId: string, action: OutboxAction, tableName: OutboxOp["tableName"], payload: Record<string, unknown>, id?: string): Promise<string> {
  // Untuk CREATE_GUEST dan CREATE_BOOK: generate localId jika belum ada.
  // localId adalah UUID v4 murni — kunci idempoten di server.
  // id outbox == localId agar flush outbox bisa cleanup by id yang sama.
  let opId = id || (typeof payload.id === "string" ? (payload.id as string) : newOpId("op"));
  let enrichedPayload = payload;

  if (action === "CREATE_GUEST" || action === "CREATE_BOOK") {
    const localId = (typeof payload.localId === "string" && payload.localId) ? payload.localId : newLocalId();
    // id lokal == localId (sementara, akan diganti server id setelah rekonsiliasi).
    opId = id || localId;
    enrichedPayload = { ...payload, id: opId, localId };
  }

  try {
    await outboxAdd({ id: opId, eventId, action, tableName, payload: enrichedPayload });
  } catch {}
  if (sqliteAdapter?.exec) {
    try {
      await sqliteAdapter.exec(
        "INSERT OR REPLACE INTO syncQueue (id, action, tableName, payload, createdAt, attempts) VALUES (?,?,?,?,?,0)",
        [opId, action, tableName, JSON.stringify({ eventId, ...enrichedPayload }), new Date().toISOString()]
      );
    } catch {}
  }
  try {
    const total = await getTotalPendingAsync(eventId);
    window.dispatchEvent(new CustomEvent("offline-queue-changed", { detail: { eventId, count: total } }));
  } catch {}
  logOffline("enqueue op", { eventId, action, opId });
  return opId;
}

/** Fase 2: migrasi satu-kali LS `offlineQueue` → outbox (move, bukan copy). Idempoten. */
export async function migrateLSQueueToOutbox(eventId: string): Promise<number> {
  let q: QueuedGuest[] = [];
  try {
    q = getQueueLS(eventId);
  } catch {
    return 0;
  }
  if (!q.length) return 0;
  let existing: OutboxOp[] = [];
  try {
    existing = await outboxList(eventId);
  } catch {
    existing = [];
  }
  const have = new Set(existing.map((o) => o.id));
  const fresh = q.filter((g) => !have.has(g.id));
  const moved: string[] = [];
  for (const g of fresh) {
    try {
      await outboxAdd({
        id: g.id,
        eventId,
        action: "CREATE_GUEST",
        tableName: "guests",
        payload: { ...g } as unknown as Record<string, unknown>,
      });
      moved.push(g.id);
    } catch {}
  }
  // Move aman: hanya hapus dari LS yang benar-benar sudah ada di outbox.
  // Jika IndexedDB diblokir (private mode/quota), antrean LS dipertahankan agar tidak hilang.
  try {
    if (moved.length) {
      const movedSet = new Set([...have, ...moved]);
      const rest = getQueueLS(eventId).filter((g) => !movedSet.has(g.id));
      setQueueLS(eventId, rest);
    }
  } catch {}
  try {
    await kvSet(`migrated:${eventId}`, new Date().toISOString());
  } catch {}
  logOffline("migrated LS→outbox", { eventId, moved: fresh.length });
  return fresh.length;
}

/** Total pending = LS (belum migrasi) + Dexie outbox. Untuk UI badge. */
export async function getTotalPendingAsync(eventId: string): Promise<number> {
  let ls = 0;
  try {
    ls = getQueueLS(eventId).length;
  } catch {}
  try {
    const c = await outboxCount(eventId);
    return ls + c;
  } catch {
    return ls;
  }
}

export async function refreshPendingCount(eventId: string): Promise<number> {
  const total = await getTotalPendingAsync(eventId);
  try {
    window.dispatchEvent(new CustomEvent("offline-queue-changed", { detail: { eventId, count: total } }));
  } catch {}
  return total;
}

/** Fase 2: pull delta sejak lastPull → update Dexie read-cache. Best-effort, tidak pernah throw. */
export async function pullDelta(eventId: string): Promise<{ pulled: number; error?: string }> {
  if (!isOnline()) return { pulled: 0, error: "offline" };
  let since: string | null = null;
  try {
    since = await kvGet(`lastPull:${eventId}`);
  } catch {}
  try {
    const qs = new URLSearchParams({ eventId, ...(since ? { since } : {}) });
    const res = await fetchWithTimeout(`/api/sync/pull?${qs}`, { method: "GET", cache: "no-store" }, FLUSH_TIMEOUT_MS);
    if (!res.ok) return { pulled: 0, error: `HTTP ${res.status}` };
    const j = (await res.json()) as {
      event?: Record<string, unknown> & { id: string };
      guests?: Record<string, unknown>[];
      guestBooks?: Record<string, unknown>[];
      pulledAt?: string;
      deletedGuestIds?: string[];
      deletedGuestLocalIds?: string[];
      deletedGuestBookIds?: string[];
      deletedGuestBookLocalIds?: string[];
    };
    const guests = Array.isArray(j.guests) ? j.guests : [];
    const books = Array.isArray(j.guestBooks) ? j.guestBooks : [];
    const delG = new Set([...(j.deletedGuestIds || []), ...(j.deletedGuestLocalIds || [])]);
    const delB = new Set([...(j.deletedGuestBookIds || []), ...(j.deletedGuestBookLocalIds || [])]);
    const liveGuests = guests.filter((g) => typeof (g as { id?: unknown }).id === "string" && !delG.has((g as { id: string }).id));
    const liveBooks = books.filter((b) => typeof (b as { id?: unknown }).id === "string" && !delB.has((b as { id: string }).id));
    // Merge ke cache: untuk Fase 2, replace-per-event jika full pull, append-merge jika delta.
    // Sederhana & aman: jika !since → replace; else merge by id.
    // Baris yang di-soft-delete di server (deleted*Ids) selalu di-evict dari cache.
    try {
      if (j.event && typeof j.event.id === "string") await putCachedEvent(j.event);
      if (!since) {
        await putCachedGuests(eventId, liveGuests);
        await putCachedBooks(eventId, liveBooks);
      } else if (liveGuests.length || liveBooks.length || delG.size || delB.size) {
        const { getCachedGuests, getCachedBooks } = await import("./db");
        const curG = await getCachedGuests(eventId);
        const curB = await getCachedBooks(eventId);
        const byId = new Map<string, Record<string, unknown>>();
        for (const g of curG) if (g && typeof (g as { id?: unknown }).id === "string") byId.set((g as { id: string }).id, g);
        for (const g of liveGuests) if (g && typeof (g as { id?: unknown }).id === "string") byId.set((g as { id: string }).id, g);
        for (const id of delG) byId.delete(id);
        const byB = new Map<string, Record<string, unknown>>();
        for (const b of curB) if (b && typeof (b as { id?: unknown }).id === "string") byB.set((b as { id: string }).id, b);
        for (const b of liveBooks) if (b && typeof (b as { id?: unknown }).id === "string") byB.set((b as { id: string }).id, b);
        for (const id of delB) byB.delete(id);
        await putCachedGuests(eventId, [...byId.values()]);
        await putCachedBooks(eventId, [...byB.values()]);
      }
      await kvSet(`lastPull:${eventId}`, j.pulledAt || new Date().toISOString());
    } catch {}
    logOffline("pull ok", { eventId, guests: liveGuests.length, books: liveBooks.length });
    return { pulled: liveGuests.length + liveBooks.length };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { pulled: 0, error: isAbort ? "timeout" : "offline" };
  }
}

async function pushBatch(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; json?: Record<string, unknown>; error?: string; status?: number }> {
  try {
    const res = await fetchWithTimeout(
      path,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      FLUSH_TIMEOUT_MS
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error || `HTTP ${res.status}`, status: res.status };
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true, json };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { ok: false, error: isAbort ? "timeout" : "offline" };
  }
}

/** Flush satu op non-batch via endpoint langsung. Return 'done' | 'keep' (konflik) | 'retry'. */
async function flushSingleOp(op: OutboxOp): Promise<{ done: boolean; conflict?: boolean; error?: string }> {
  const p = op.payload as Record<string, unknown>;
  const id = typeof p.id === "string" ? (p.id as string) : op.id;
  const eventId = op.eventId;
  const json = async (r: Response) => (await r.json().catch(() => ({}))) as { error?: string };

  try {
    if (op.action === "UPDATE_GUEST") {
      const res = await fetchWithTimeout(`/api/guests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.fields ?? p) }, FLUSH_TIMEOUT_MS);
      if (res.ok) return { done: true };
      const j = await json(res);
      if (res.status === 404) return { done: true }; // sudah hilang di server → anggap sinkron
      if (res.status === 409) return { done: false, conflict: true };
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error }; // validasi → buang agar tidak macet, catat error
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "DELETE_GUEST") {
      const res = await fetchWithTimeout(`/api/guests/${id}`, { method: "DELETE" }, FLUSH_TIMEOUT_MS);
      if (res.ok || res.status === 404) return { done: true };
      const j = await json(res);
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "UPDATE_BOOK") {
      const res = await fetchWithTimeout(`/api/guestbooks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.fields ?? p) }, FLUSH_TIMEOUT_MS);
      if (res.ok) return { done: true };
      const j = await json(res);
      if (res.status === 404) return { done: true };
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "DELETE_BOOK") {
      const res = await fetchWithTimeout(`/api/guestbooks/${id}`, { method: "DELETE" }, FLUSH_TIMEOUT_MS);
      if (res.ok || res.status === 404) return { done: true };
      const j = await json(res);
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "UPDATE_EVENT") {
      const res = await fetchWithTimeout(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.fields ?? p) }, FLUSH_TIMEOUT_MS);
      if (res.ok) return { done: true };
      const j = await json(res);
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "ADD_MEMBER") {
      const res = await fetchWithTimeout(`/api/events/${eventId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.fields ?? p) }, FLUSH_TIMEOUT_MS);
      if (res.ok) return { done: true };
      const j = await json(res);
      if (res.status === 409 || res.status === 404) return { done: true };
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    if (op.action === "REMOVE_MEMBER") {
      const userId = typeof p.userId === "string" ? (p.userId as string) : "";
      const res = await fetchWithTimeout(`/api/events/${eventId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }, FLUSH_TIMEOUT_MS);
      if (res.ok || res.status === 404) return { done: true };
      const j = await json(res);
      if (res.status >= 400 && res.status < 500) return { done: true, error: j.error };
      return { done: false, error: j.error || `HTTP ${res.status}` };
    }
    return { done: false, error: `unknown-action ${op.action}` };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { done: false, error: isAbort ? "timeout" : "offline" };
  }
}

async function flushOutbox(eventId: string): Promise<FlushResult> {
  await migrateLSQueueToOutbox(eventId).catch(() => 0);
  const ops = await outboxList(eventId).catch(() => [] as OutboxOp[]);
  if (!ops.length) return { flushed: 0, conflicts: 0 };

  const eventCreates = ops.filter((o) => o.action === "CREATE_EVENT");
  const creates = ops.filter((o) => o.action === "CREATE_GUEST");
  const bookCreates = ops.filter((o) => o.action === "CREATE_BOOK");
  const rest = ops.filter((o) => o.action !== "CREATE_GUEST" && o.action !== "CREATE_BOOK" && o.action !== "CREATE_EVENT");

  let flushed = 0;
  let conflicts = 0;
  let firstError: string | undefined;

  // Batch event creates first (acara dibuat offline) via /api/sync/push.
  if (eventCreates.length) {
    const events = eventCreates.map((o) => o.payload);
    const r = await pushBatch("/api/sync/push", { guests: [], events, guestBooks: [] });
    if (!r.ok) {
      firstError = r.error;
      for (const o of eventCreates) await outboxBump(o.id, r.error || "push-failed");
      if (r.error === "offline" || r.error === "timeout") {
        const fails = getFailCount(eventId) + 1;
        setFailCount(eventId, fails);
        await refreshPendingCount(eventId).catch(() => 0);
        return { flushed: 0, conflicts: 0, error: r.error };
      }
    } else {
      const j = r.json as { synced?: { events?: number }; conflicts?: { id: string; reason?: string }[] };
      const forbiddenIds = new Set((j.conflicts || []).filter((c) => c.reason === "FORBIDDEN").map((c) => c.id));
      const conflictIds = new Set((j.conflicts || []).map((c) => c.id));
      const doneIds = eventCreates.filter((o) => !conflictIds.has(o.id)).map((o) => o.id);
      if (doneIds.length) await outboxRemove(doneIds);
      // Item ditolak server karena role (VIEWER) langsung dibuang, bukan retry.
      if (forbiddenIds.size) await outboxRemove([...forbiddenIds]);
      flushed += j.synced?.events ?? doneIds.length;
      conflicts += conflictIds.size;
      for (const o of eventCreates) if (conflictIds.has(o.id) && !forbiddenIds.has(o.id)) await outboxBump(o.id, "EVENT_CONFLICT");
    }
  }

  // Batch guest creates via /api/sync/push (idempoten by localId di server).
  if (creates.length) {
    const guests = creates.map((o) => o.payload);
    const r = await pushBatch("/api/sync/push", { guests, events: [], guestBooks: [] });
    if (!r.ok) {
      firstError = r.error;
      for (const o of creates) await outboxBump(o.id, r.error || "push-failed");
      const fails = getFailCount(eventId) + 1;
      setFailCount(eventId, fails);
      // Jangan lanjut ke op lain jika jaringan mati — hemat baterai & hindari attempts meledak.
      if (r.error === "offline" || r.error === "timeout") {
        await refreshPendingCount(eventId).catch(() => 0);
        return { flushed: 0, conflicts: 0, error: r.error };
      }
    } else {
      const j = r.json as {
        synced?: { guests?: number };
        syncedItems?: { guests?: { id: string; localId: string | null }[] };
        conflicts?: { id: string; localId?: string | null; reason?: string }[];
      };
      const forbiddenIds = new Set((j.conflicts || []).filter((c) => c.reason === "FORBIDDEN").map((c) => c.id));
      const conflictIds = new Set((j.conflicts || []).map((c) => c.id));
      const doneIds = creates.filter((o) => !conflictIds.has(o.id)).map((o) => o.id);
      if (doneIds.length) await outboxRemove(doneIds);
      if (forbiddenIds.size) await outboxRemove([...forbiddenIds]);
      flushed += j.synced?.guests ?? doneIds.length;
      conflicts += conflictIds.size;
      for (const o of creates) if (conflictIds.has(o.id) && !forbiddenIds.has(o.id)) await outboxBump(o.id, "DUPLICATE_NEED_NOTE");
      // Rekonsiliasi id: update Dexie cache — ganti baris yang id-nya == localId
      // dengan server id yang dikembalikan di syncedItems.guests.
      // Ini memastikan pull delta berikutnya tidak insert baris kedua.
      try {
        const syncedGuests = j.syncedItems?.guests ?? [];
        for (const item of syncedGuests) {
          if (!item.localId || item.id === item.localId) continue;
          const { getCachedGuests, putCachedGuests } = await import("./db");
          const cur = await getCachedGuests(eventId);
          const updated = cur.map((g) =>
            (g as Record<string, unknown>).id === item.localId
              ? { ...(g as Record<string, unknown>), id: item.id }
              : g
          );
          await putCachedGuests(eventId, updated);
        }
      } catch {}
    }
  }

  // Batch book creates via /api/sync/push.
  if (bookCreates.length && (!firstError || (firstError !== "offline" && firstError !== "timeout"))) {
    const guestBooks = bookCreates.map((o) => o.payload);
    const r = await pushBatch("/api/sync/push", { guests: [], events: [], guestBooks });
    if (!r.ok) {
      firstError = firstError || r.error;
      for (const o of bookCreates) await outboxBump(o.id, r.error || "push-failed");
    } else {
      const j = r.json as {
        synced?: { guestBooks?: number };
        syncedItems?: { guestBooks?: { id: string; localId: string | null }[] };
        conflicts?: { id: string; localId?: string | null; reason?: string }[];
      };
      // Server push untuk buku: samakan dengan tamu — hanya FORBIDDEN (VIEWER)
      // yang dibuang. DUPLICATE di-bump agar muncul di UI resolusi, bukan hilang diam-diam.
      const forbiddenIds = new Set((j.conflicts || []).filter((c) => c.reason === "FORBIDDEN").map((c) => c.id));
      const conflictIds = new Set((j.conflicts || []).map((c) => c.id));
      const doneIds = bookCreates.filter((o) => !conflictIds.has(o.id)).map((o) => o.id);
      if (doneIds.length) await outboxRemove(doneIds);
      if (forbiddenIds.size) await outboxRemove([...forbiddenIds]);
      flushed += j.synced?.guestBooks ?? doneIds.length;
      conflicts += (j.conflicts || []).length;
      for (const o of bookCreates) if (conflictIds.has(o.id) && !forbiddenIds.has(o.id)) await outboxBump(o.id, "DUPLICATE_NEED_NOTE");
      // Rekonsiliasi id untuk buku tamu di Dexie cache.
      try {
        const syncedBooks = j.syncedItems?.guestBooks ?? [];
        for (const item of syncedBooks) {
          if (!item.localId || item.id === item.localId) continue;
          const { getCachedBooks, putCachedBooks } = await import("./db");
          const cur = await getCachedBooks(eventId);
          const updated = cur.map((b) =>
            (b as Record<string, unknown>).id === item.localId
              ? { ...(b as Record<string, unknown>), id: item.id }
              : b
          );
          await putCachedBooks(eventId, updated);
        }
      } catch {}
    }
  }

  // Sisa op satu-per-satu (update/delete). Berhenti dini jika offline.
  for (const op of rest) {
    // Cap attempts agar op rusak tidak macet selamanya: >25 → buang + catat.
    if ((op.attempts || 0) > 25) {
      await outboxRemove([op.id]);
      firstError = firstError || op.lastError || "too-many-attempts";
      continue;
    }
    const r = await flushSingleOp(op);
    if (r.done) {
      await outboxRemove([op.id]);
      flushed += 1;
    } else if (r.conflict) {
      conflicts += 1;
      await outboxBump(op.id, "DUPLICATE_NEED_NOTE");
      firstError = firstError || "DUPLICATE_NEED_NOTE";
    } else {
      await outboxBump(op.id, r.error || "flush-failed");
      firstError = firstError || r.error;
      if (r.error === "offline" || r.error === "timeout") break;
    }
  }

  if (flushed > 0) resetFailCount(eventId);
  else {
    const fails = getFailCount(eventId) + 1;
    setFailCount(eventId, fails);
  }
  try {
    localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString());
  } catch {}
  await refreshPendingCount(eventId).catch(() => 0);

  // Pull best-effort setelah push sukses (agar perangkat lain kelihatan).
  if (flushed > 0) {
    try {
      const pr = await pullDelta(eventId);
      if (pr.pulled > 0) logOffline("post-flush pull", { eventId, pulled: pr.pulled });
    } catch {}
  }

  logOffline("flushOutbox done", { eventId, flushed, conflicts, firstError });
  return { flushed, conflicts, ...(firstError && flushed === 0 ? { error: firstError } : firstError && conflicts > 0 ? { error: firstError } : {}) };
}

export async function flushOfflineQueue(eventId: string): Promise<FlushResult> {
  // Fase 2: jalur utama = outbox Dexie (mencakup migrasi LS lama).
  // Jika Dexie tidak tersedia (SSR/privat), fallback ke logika LS lama agar tetap jalan.
  if (!isOnline()) {
    let pending = 0;
    try {
      pending = await getTotalPendingAsync(eventId);
    } catch {
      pending = getQueue(eventId).length;
    }
    if (!pending) return { flushed: 0, conflicts: 0 };
    logOffline("flush skip: navigator offline", { eventId, pending });
    return { flushed: 0, conflicts: 0, error: "offline" };
  }
  try {
    const hasDb = typeof window !== "undefined" && typeof indexedDB !== "undefined";
    if (hasDb) return await flushOutbox(eventId);
  } catch {}
  // Fallback LS-only (Dexie diblokir):
  const q = getQueue(eventId);
  if (!q.length) return { flushed: 0, conflicts: 0 };
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `/api/sync/push`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guests: q, events: [], guestBooks: [] }),
      },
      FLUSH_TIMEOUT_MS
    );
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    const fails = getFailCount(eventId) + 1;
    setFailCount(eventId, fails);
    logOffline("flush network throw", { eventId, pending: q.length, timeout: isAbort, fails });
    return { flushed: 0, conflicts: 0, error: isAbort ? "timeout" : "offline" };
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as { error?: string }));
    const fails = getFailCount(eventId) + 1;
    setFailCount(eventId, fails);
    logOffline("flush HTTP fail", { eventId, status: res.status, fails });
    return { flushed: 0, conflicts: 0, error: (j as { error?: string }).error || `HTTP ${res.status}` };
  }
  let j: { synced?: { guests?: number }; conflicts?: { id: string }[] };
  try {
    j = (await res.json()) as { synced?: { guests?: number }; conflicts?: { id: string }[] };
  } catch {
    const fails = getFailCount(eventId) + 1;
    setFailCount(eventId, fails);
    return { flushed: 0, conflicts: 0, error: "bad-response" };
  }
  const conflicts = j.conflicts?.length ?? 0;
  if (conflicts === 0) {
    setQueue(eventId, []);
  } else {
    const conflictIds = new Set(j.conflicts!.map((c) => c.id));
    setQueue(eventId, q.filter((x) => conflictIds.has(x.id)));
  }
  resetFailCount(eventId);
  try {
    localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString());
    window.dispatchEvent(new CustomEvent("offline-queue-changed", { detail: { eventId, count: getPendingCount(eventId) } }));
  } catch {}
  logOffline("flush ok", { eventId, flushed: j.synced?.guests ?? 0, conflicts });
  return { flushed: j.synced?.guests ?? 0, conflicts };
}

// ---------- Fase 5: resolusi konflik ----------

/** Op yang nyangkut karena butuh catatan (duplikat nama+alamat). */
export async function getConflictOps(eventId: string): Promise<OutboxOp[]> {
  try {
    const ops = await outboxList(eventId);
    return ops.filter((o) => o.lastError === "DUPLICATE_NEED_NOTE");
  } catch {
    return [];
  }
}

/** Tampilan ringkas satu op konflik untuk UI. */
export function conflictGuestView(op: OutboxOp): {
  nama: string;
  alamat: string;
  nominal: number;
  metode: string;
} {
  const p = op.payload as Record<string, unknown>;
  // CREATE_GUEST: field langsung di payload; UPDATE_GUEST: di payload.fields.
  const src =
    op.action === "UPDATE_GUEST" && p.fields && typeof p.fields === "object"
      ? (p.fields as Record<string, unknown>)
      : p;
  return {
    nama: typeof src.nama === "string" ? src.nama : "-",
    alamat: typeof src.alamat === "string" ? src.alamat : "-",
    nominal: typeof src.nominal === "number" ? src.nominal : 0,
    metode: typeof src.metode === "string" ? src.metode : "-",
  };
}

/**
 * Selesaikan konflik dengan mengisi catatan, lalu antre ulang (attempts direset).
 * Server mengizinkan duplikat selama ada catatan (CREATE_GUEST_DUPLICATE_WITH_NOTE).
 */
export async function resolveGuestConflict(
  eventId: string,
  opId: string,
  catatan: string
): Promise<void> {
  const note = catatan.trim();
  if (!note) throw new Error("Catatan wajib untuk bedakan duplikat");
  const ops = await outboxList(eventId).catch(() => [] as OutboxOp[]);
  const op = ops.find((o) => o.id === opId);
  if (!op) throw new Error("Data konflik tidak ditemukan (mungkin sudah tersync)");
  if (op.action === "UPDATE_GUEST") {
    const p = { ...(op.payload as Record<string, unknown>) };
    const fields = { ...((p.fields as Record<string, unknown>) || {}) , catatan: note };
    await outboxUpdate(opId, { payload: { ...p, fields }, attempts: 0, lastError: null });
  } else {
    await outboxUpdate(opId, {
      payload: { ...(op.payload as Record<string, unknown>), catatan: note },
      attempts: 0,
      lastError: null,
    });
  }
  await refreshPendingCount(eventId).catch(() => {});
  logOffline("conflict resolved", { eventId, opId });
}

/** Buang op konflik (data tidak dikirim ke server). Hapus juga baris optimistik via callback UI. */
export async function discardOp(eventId: string, opId: string): Promise<void> {
  await outboxRemove([opId]);
  await refreshPendingCount(eventId).catch(() => {});
  logOffline("op discarded", { eventId, opId });
}

// Background ticker: call once per EventClient mount
// Fase 1: interval 1 menit + backoff eksponensial saat gagal + guard overlap + offline/online aware.
export function startBackgroundSync(eventId: string, onFlush?: (r: FlushResult) => void) {
  if (typeof window === "undefined") return () => {};
  let stopped = false;
  let timer: number | null = null;
  let ticking = false;
  let onlineHandler: (() => void) | null = null;
  let offlineHandler: (() => void) | null = null;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(tick, ms);
  };

  const tick = async () => {
    if (stopped || ticking) {
      schedule(getBackoffDelayMs(eventId));
      return;
    }
    try {
      // Always-connected: sync otomatis selalu aktif, tidak ada toggle manual.
      if (!isOnline()) {
        schedule(SYNC_INTERVAL_MS);
        return;
      }
      // Fase 2: cek total pending async (LS + outbox). getPendingCount sync hanya LS (cepat).
      let pending = 0;
      try {
        pending = await getTotalPendingAsync(eventId);
      } catch {
        pending = getPendingCount(eventId);
      }
      if (pending === 0) {
        resetFailCount(eventId);
        schedule(SYNC_INTERVAL_MS);
        return;
      }
      ticking = true;
      // run in background idle, don't block UI
      const run = async () => {
        try {
          const r = await flushOfflineQueue(eventId);
          onFlush?.(r);
        } catch (e) {
          logOffline("tick unhandled", e);
        } finally {
          ticking = false;
          schedule(getBackoffDelayMs(eventId));
        }
      };
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (ric) ric(() => void run());
      else setTimeout(() => void run(), 50);
      return;
    } catch {
      ticking = false;
    }
    schedule(getBackoffDelayMs(eventId));
  };

  // interval dinamis (timeout chain) + also on online event + on visibility
  onlineHandler = () => {
    resetFailCount(eventId);
    setTimeout(() => void tick(), 1500);
  };
  offlineHandler = () => {
    logOffline("browser offline", { eventId });
  };
  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);
  const vis = () => {
    if (document.visibilityState === "visible") setTimeout(() => void tick(), 800);
  };
  document.addEventListener("visibilitychange", vis);

  // initial check after mount
  setTimeout(() => void tick(), 3000);

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    if (offlineHandler) window.removeEventListener("offline", offlineHandler);
    document.removeEventListener("visibilitychange", vis);
  };
}

/** Total pending lintas semua acara (untuk dashboard + TopBar global). */
export async function getGlobalPendingCount(): Promise<number> {
  try {
    const { outboxCountAll } = await import("./db");
    return await (outboxCountAll as () => Promise<number>)();
  } catch {}
  try {
    const { getDb } = await import("./db");
    const d = getDb();
    if (!d) return 0;
    return await d.outbox.count();
  } catch {
    return 0;
  }
}

/** Flush semua eventId yang punya antrean (dipakai dashboard). */
export async function flushAllPending(): Promise<FlushResult> {
  let total = 0;
  let conflicts = 0;
  let error: string | undefined;
  try {
    const { getDb } = await import("./db");
    const d = getDb();
    if (!d) return { flushed: 0, conflicts: 0 };
    const rows = await d.outbox.toArray().catch(() => []);
    const ids = [...new Set(rows.map((r) => r.eventId))];
    for (const id of ids) {
      const r = await flushOfflineQueue(id).catch((e) => ({ flushed: 0, conflicts: 0, error: e instanceof Error ? e.message : "flush-failed" }) as FlushResult);
      total += r.flushed;
      conflicts += r.conflicts;
      if (r.error && !error) error = r.error;
      if (r.error === "offline" || r.error === "timeout") break;
    }
  } catch (e) {
    if (!error) error = e instanceof Error ? e.message : "flush-failed";
  }
  return { flushed: total, conflicts, ...(error && total === 0 ? { error } : {}) };
}
