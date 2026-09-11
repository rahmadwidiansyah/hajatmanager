/**
 * Sync engine — shared logic for flush/pull used by web localStorage and native SQLite.
 * Keeps 30m background ticker contract: non-blocking, online-only, retry backoff.
 */
export const SYNC_INTERVAL_MS = 30 * 60 * 1000;

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

export async function pushToServer(payload: PushPayload): Promise<{ ok: boolean; conflicts?: { id: string; reason: string }[]; error?: string }> {
  try {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: (j as { error?: string }).error || `HTTP ${res.status}` };
    }
    const j = (await res.json()) as { conflicts?: { id: string; reason: string }[] };
    return { ok: true, conflicts: j.conflicts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pullFromServer(eventId: string, since?: string) {
  const qs = new URLSearchParams({ eventId, ...(since ? { since } : {}) });
  const res = await fetch(`/api/sync/pull?${qs}`);
  if (!res.ok) throw new Error(`pull failed ${res.status}`);
  return res.json();
}
