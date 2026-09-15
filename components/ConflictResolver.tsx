"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import {
  conflictGuestView,
  discardOp,
  flushOfflineQueue,
  getConflictOps,
  resolveGuestConflict,
  type OutboxOp,
} from "@/lib/offline-sync";

type Existing = {
  nama: string;
  alamat: string;
  nominalFormatted?: string;
  nominal?: number;
  metode?: string;
} | null;

/**
 * Fase 5: modal penyelesaian konflik duplikat (nama+alamat sama, tanpa catatan).
 * Setiap baris: tampilkan data antrean + data server yang bentrok, isi catatan,
 * Simpan (kirim ulang) atau Buang (batal kirim).
 */
export function ConflictResolver({
  eventId,
  onClose,
  onChanged,
}: {
  eventId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ops, setOps] = useState<OutboxOp[] | null>(null);
  const [existing, setExisting] = useState<Record<string, Existing>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setOps(await getConflictOps(eventId));
    } catch {
      setOps([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getConflictOps(eventId);
        if (!cancelled) setOps(data);
      } catch {
        if (!cancelled) setOps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Muat data pembanding dari server (best-effort; offline → null).
  useEffect(() => {
    if (!ops || ops.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        ops.map(async (op) => {
          const v = conflictGuestView(op);
          try {
            const qs = new URLSearchParams({ nama: v.nama, alamat: v.alamat });
            const res = await fetch(`/api/events/${eventId}/guests/check?${qs}`);
            if (!res.ok) return [op.id, null] as const;
            const j = await res.json();
            return [op.id, (j.exists ? j.existing : null) as Existing] as const;
          } catch {
            return [op.id, null] as const;
          }
        })
      );
      if (!cancelled) setExisting(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [ops, eventId]);

  async function handleResolve(opId: string) {
    const note = (notes[opId] || "").trim();
    if (!note) {
      setError("Catatan wajib untuk bedakan duplikat");
      return;
    }
    setBusyId(opId);
    setError(null);
    try {
      await resolveGuestConflict(eventId, opId, note);
      await flushOfflineQueue(eventId).catch(() => ({ flushed: 0, conflicts: 0 }));
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyelesaikan konflik");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDiscard(opId: string) {
    if (!confirm("Buang data ini? Data tidak akan dikirim ke server.")) return;
    setBusyId(opId);
    setError(null);
    try {
      await discardOp(eventId, opId);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuang data");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]/50 backdrop-blur-sm p-4 flex justify-center items-start sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Selesaikan data duplikat"
    >
      <div className="relative w-full max-w-md my-4 sm:my-8 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-[var(--on-surface)] flex items-center gap-2">
            <AlertTriangle size={16} className="text-[var(--warning)]" />
            Data butuh catatan ({ops?.length ?? "…"})
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 rounded-full bg-[var(--surface-container)] border border-[var(--outline-variant)] flex items-center justify-center hover:bg-[var(--surface-container-high)] transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[var(--on-surface-variant)] mb-4">
          Nama + alamat ini sudah tercatat di server. Isi catatan pembeda agar bisa
          tersimpan, atau buang bila salah input.
        </p>

        {ops === null && (
          <p className="py-6 text-center text-sm text-[var(--on-surface-variant)]">Memuat…</p>
        )}
        {ops !== null && ops.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--on-surface-variant)]">
            Semua konflik selesai 🎉
          </p>
        )}

        <div className="flex flex-col gap-3">
          {ops?.map((op) => {
            const v = conflictGuestView(op);
            const ex = existing[op.id];
            const busy = busyId === op.id;
            return (
              <div
                key={op.id}
                data-testid={`conflict-${op.id}`}
                className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)] p-3"
              >
                <div className="font-medium text-sm text-[var(--on-surface)]">{v.nama}</div>
                <div className="text-xs text-[var(--on-surface-variant)]">
                  {v.alamat} · {formatRupiah(v.nominal)} · {v.metode}
                </div>
                {ex && (
                  <div className="mt-1.5 text-xs text-[var(--on-warning-container)] bg-[var(--warning-container)] border border-[var(--outline-variant)] rounded-lg px-2 py-1.5">
                    Sudah ada: {ex.nama} — {ex.nominalFormatted ?? (typeof ex.nominal === "number" ? formatRupiah(ex.nominal) : "")}
                    {ex.metode ? ` · ${ex.metode}` : ""}
                  </div>
                )}
                <input
                  value={notes[op.id] || ""}
                  onChange={(e) => setNotes((m) => ({ ...m, [op.id]: e.target.value }))}
                  placeholder="Catatan pembeda, mis: Krajan Lor"
                  maxLength={200}
                  disabled={busy}
                  aria-label={`Catatan untuk ${v.nama}`}
                  className="mt-2 w-full h-10 px-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleResolve(op.id)}
                    disabled={busy || !(notes[op.id] || "").trim()}
                    className="flex-1 h-10 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {busy ? "…" : "Simpan & sync"}
                  </button>
                  <button
                    onClick={() => handleDiscard(op.id)}
                    disabled={busy}
                    aria-label={`Buang ${v.nama}`}
                    className="w-10 h-10 rounded-xl border border-[var(--outline-variant)] flex items-center justify-center text-[var(--error)] hover:bg-[var(--error-container)] disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--error)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
