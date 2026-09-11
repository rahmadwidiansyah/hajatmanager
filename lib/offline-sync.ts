"use client";
// Lightweight background sync foundation for web + native WebView.
// - Queue format: localStorage `offlineQueue:${eventId}` JSON array (web fallback)
// - Native (Tauri SQLite / Capacitor SQLite) injects SqliteAdapter via setSqliteAdapter()
//   then queue lives in SQLite `syncQueue` instead — pendingCount tetap via getPendingCount()
// - Auto push every 30 minutes when online, non-blocking (requestIdleCallback / setTimeout)
// - Manual flush via `flushOfflineQueue(eventId)`

export const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 menit sesuai permintaan
export const QUEUE_KEY = (eventId: string) => `offlineQueue:${eventId}`;
export const LAST_SYNC_KEY = (eventId: string) => `lastSyncAt:${eventId}`;
export const AUTOSYNC_KEY = (eventId: string) => `autoSync:${eventId}`;
export const INTERVAL_KEY = (eventId: string) => `autoSyncInterval:${eventId}`;

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

export async function flushOfflineQueue(eventId: string): Promise<{ flushed: number; conflicts: number; error?: string }> {
  const q = getQueue(eventId);
  if (!q.length) return { flushed: 0, conflicts: 0 };
  if (!isOnline()) return { flushed: 0, conflicts: 0, error: "offline" };
  // Split into guests payload; events/guestBooks handled separately if needed
  const res = await fetch(`/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guests: q, events: [], guestBooks: [] }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { flushed: 0, conflicts: 0, error: (j as { error?: string }).error || `HTTP ${res.status}` };
  }
  const j = (await res.json()) as { synced?: { guests?: number }; conflicts?: { id: string }[] };
  const conflicts = j.conflicts?.length ?? 0;
  // Remove successfully synced items (keep conflicts for manual resolve)
  if (conflicts === 0) {
    setQueue(eventId, []);
  } else {
    const conflictIds = new Set(j.conflicts!.map((c) => c.id));
    setQueue(eventId, q.filter((x) => conflictIds.has(x.id)));
  }
  try {
    localStorage.setItem(LAST_SYNC_KEY(eventId), new Date().toISOString());
    window.dispatchEvent(new CustomEvent("offline-queue-changed", { detail: { eventId, count: getPendingCount(eventId) } }));
  } catch {}
  return { flushed: j.synced?.guests ?? 0, conflicts };
}

// Background ticker: call once per EventClient mount
export function startBackgroundSync(eventId: string, onFlush?: (r: { flushed: number }) => void) {
  if (typeof window === "undefined") return () => {};
  let timer: number | null = null;
  let onlineHandler: (() => void) | null = null;

  const tick = async () => {
    try {
      const auto = localStorage.getItem(AUTOSYNC_KEY(eventId));
      if (auto !== null && JSON.parse(auto) === false) return;
      if (!isOnline()) return;
      if (getPendingCount(eventId) === 0) return;
      // run in background idle, don't block UI
      const run = async () => {
        const r = await flushOfflineQueue(eventId).catch(() => ({ flushed: 0, conflicts: 0 }));
        onFlush?.(r);
      };
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (ric) ric(run);
      else setTimeout(run, 50);
    } catch {}
  };

  // interval 30 menit + also on online event + on visibility
  timer = window.setInterval(tick, SYNC_INTERVAL_MS);
  onlineHandler = () => {
    setTimeout(tick, 1500);
  };
  window.addEventListener("online", onlineHandler);
  const vis = () => {
    if (document.visibilityState === "visible") setTimeout(tick, 800);
  };
  document.addEventListener("visibilitychange", vis);

  // initial check after mount
  setTimeout(tick, 3000);

  return () => {
    if (timer) clearInterval(timer);
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    document.removeEventListener("visibilitychange", vis);
  };
}
