/**
 * Sync engine — shared logic for flush/pull used by web localStorage and native SQLite.
 * Fase 2: interval 1m + timeout + retry backoff + attempts. Web utama pakai lib/offline-sync.ts
 * (Dexie outbox); modul ini jadi kontrak + fallback untuk native/tests.
 */
export const SYNC_INTERVAL_MS = 60 * 1000;
export const FLUSH_TIMEOUT_MS = 12_000;
export const MAX_ATTEMPTS = 25;

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

// Keep API shape aligned with app/api/sync/push
export type PushPayload = {
  events?: { id: string; namaAcara: string; namaTuanRumah?: string | null; tanggal: string; lokasi?: string | null; catatan?: string | null; mejaList?: string[]; mode?: "ONLINE" | "OFFLINE" }[];
  guestBooks?: { id: string; eventId: string; nama: string; alamat: string; createdAt?: string }[];
  guests: QueuedGuest[];
};

export async function pushToServer(payload: PushPayload, timeoutMs = FLUSH_TIMEOUT_MS): Promise<{ ok: boolean; conflicts?: { id: string; reason: string }[]; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: (j as { error?: string }).error || `HTTP ${res.status}` };
    }
    const j = (await res.json()) as { conflicts?: { id: string; reason: string }[] };
    return { ok: true, conflicts: j.conflicts };
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError";
    return { ok: false, error: isAbort ? "timeout" : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Backoff eksponensial untuk retry: 1m,2m,4m,8m,10m(max). */
export function backoffDelayMs(attempts: number, baseMs = SYNC_INTERVAL_MS, maxMs = 10 * 60 * 1000): number {
  if (attempts <= 0) return baseMs;
  return Math.min(baseMs * 2 ** Math.min(attempts, 5), maxMs);
}

/** Apakah error layak di-retry? 4xx validasi (kecuali 408/429) → jangan retry selamanya. */
export function isRetryablePushError(error?: string): boolean {
  if (!error) return false;
  if (error === "offline" || error === "timeout") return true;
  if (error.startsWith("HTTP")) {
    const code = Number(error.slice(5).trim());
    if (code === 408 || code === 429 || code >= 500) return true;
    return false;
  }
  return true;
}

export async function pullFromServer(eventId: string, since?: string, timeoutMs = FLUSH_TIMEOUT_MS) {
  const qs = new URLSearchParams({ eventId, ...(since ? { since } : {}) });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/sync/pull?${qs}`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`pull failed ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}
