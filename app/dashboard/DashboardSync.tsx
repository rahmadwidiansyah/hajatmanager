"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WifiOff, CloudUpload, CloudCheck, CalendarDays } from "lucide-react";

type PendingEvent = {
  id: string;
  namaAcara: string;
  tanggal: string;
  lokasi?: string | null;
};

/** Bar sync global dashboard: hijau = tersinkron, kuning = ada antrean, abu = offline. */
export function DashboardSync() {
  const router = useRouter();
  // Hydration-safe: server selalu render "online". Status asli disinkron di useEffect (reload).
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);

  const reload = useCallback(async () => {
    try {
      const mod = await import("@/lib/offline-sync");
      setOnline(mod.isOnline());
      try {
        setPending(await mod.getGlobalPendingCount());
      } catch {
        setPending(0);
      }
    } catch {
      setOnline(typeof navigator === "undefined" || navigator.onLine);
    }
    try {
      const { getDb } = await import("@/lib/db");
      const d = getDb();
      if (d) {
        const ops = await d.outbox.where("action").equals("CREATE_EVENT").toArray().catch(() => []);
        setPendingEvents(
          ops.map((o) => {
            const p = o.payload as Record<string, unknown>;
            return {
              id: o.id,
              namaAcara: typeof p.namaAcara === "string" ? p.namaAcara : "(Tanpa nama)",
              tanggal: typeof p.tanggal === "string" ? p.tanggal : new Date().toISOString(),
              lokasi: typeof p.lokasi === "string" ? p.lokasi : null,
            };
          })
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    reload();
    const onNet = () => reload();
    const onQueue = () => reload();
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    window.addEventListener("offline-queue-changed", onQueue as EventListener);
    window.addEventListener("dashboard-events-changed", onQueue as EventListener);
    const t = window.setInterval(reload, 15000);
    return () => {
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
      window.removeEventListener("offline-queue-changed", onQueue as EventListener);
      window.removeEventListener("dashboard-events-changed", onQueue as EventListener);
      window.clearInterval(t);
    };
  }, [reload]);

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    setMsg(null);
    try {
      const mod = await import("@/lib/offline-sync");
      if (!mod.isOnline()) {
        setMsg("Kamu sedang offline — acara & data tersimpan di perangkat, terkirim otomatis saat online.");
        return;
      }
      const r = await mod.flushAllPending();
      await reload();
      if (r.error === "offline" || r.error === "timeout") {
        setMsg("Koneksi terputus — data aman di perangkat, coba lagi.");
      } else if (r.error) {
        setMsg(`Sync belum tuntas: ${r.error}`);
      } else if (r.flushed > 0) {
        setMsg(`Tersync ${r.flushed} data.`);
        router.refresh();
      } else {
        router.refresh();
      }
    } finally {
      setSyncing(false);
    }
  }

  const state: "synced" | "pending" | "offline" = !online ? "offline" : pending > 0 ? "pending" : "synced";

  return (
    <div className="mb-6 space-y-3">
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border text-sm ${
          state === "offline"
            ? "bg-[var(--surface-container)] border-[var(--outline-variant)] text-[var(--on-surface-variant)]"
            : state === "pending"
              ? "bg-[var(--warning-container)] border-[var(--outline-variant)] text-[var(--on-warning-container)]"
              : "bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] text-[var(--on-surface-variant)]"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white ${
              state === "synced" ? "bg-emerald-600" : state === "pending" ? "bg-amber-500" : "bg-gray-400"
            }`}
            aria-hidden
          >
            {!online ? <WifiOff size={15} /> : pending > 0 ? <CloudUpload size={15} /> : <CloudCheck size={15} />}
          </span>
          <p className="truncate text-xs sm:text-sm">
            {!online
              ? `Offline — data tersimpan lokal${pending > 0 ? ` (${pending} antre)` : ""}`
              : pending > 0
                ? `${pending} data belum sync — hijau berarti sudah di server`
                : "Semua tersinkron ke server"}
          </p>
        </div>
        <button
          onClick={syncNow}
          disabled={syncing}
          className="h-8 px-3 rounded-full bg-[var(--primary)] text-[var(--on-primary)] text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {syncing ? "Sync…" : "Sync"}
        </button>
      </div>
      {msg && (
        <p role="status" className="text-xs text-[var(--on-surface-variant)] px-1">
          {msg}
        </p>
      )}
      {pendingEvents.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingEvents.map((ev) => (
            <div key={ev.id} className="bg-[var(--surface-container-lowest)] border border-dashed border-[var(--warning)] rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-[var(--on-surface)] leading-snug">{ev.namaAcara}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--warning)] text-white shrink-0">
                  Menunggu sync
                </span>
              </div>
              <p className="text-xs text-[var(--on-surface-variant)] flex items-center gap-1">
                <CalendarDays size={14} />
                {new Date(ev.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}
                {ev.lokasi ? ` · ${ev.lokasi}` : ""}
              </p>
              <p className="text-xs text-[var(--on-surface-variant)] mt-2">
                Dibuat offline — buka untuk input sambil menunggu sync.
              </p>
              <Link href={`/events/${ev.id}`} className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
                Buka Acara →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
