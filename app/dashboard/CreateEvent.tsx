"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";

export default function CreateEvent() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [namaAcara, setNamaAcara] = useState("");
  const [namaTuanRumah, setNamaTuanRumah] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [lokasi, setLokasi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // P0: body scroll-lock saat dialog terbuka + Escape untuk tutup
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  function newLocalId() {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {}
    return `evt-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function saveOfflineQueue(reason: string) {
    const { enqueueOp, isOnline } = await import("@/lib/offline-sync");
    const { putCachedEvent } = await import("@/lib/db");
    const id = newLocalId();
    const payload = {
      id,
      namaAcara: namaAcara.trim(),
      namaTuanRumah: namaTuanRumah.trim() || null,
      tanggal: new Date(tanggal).toISOString(),
      lokasi: lokasi.trim() || null,
      catatan: catatan.trim() || null,
      mejaList: ["MEJA-1", "MEJA-2"],
    };
    // Offline-first: simpan ke outbox + read-cache agar langsung tampil di dashboard.
    await enqueueOp(id, "CREATE_EVENT", "events", payload, id).catch(() => {});
    try {
      await putCachedEvent({ ...payload, myRole: "OWNER", pendingLocal: true });
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("dashboard-events-changed", { detail: { id } }));
    } catch {}
    void isOnline;
    setInfo(
      reason === "offline"
        ? "Kamu sedang offline — acara disimpan di perangkat dan akan terkirim otomatis saat online (tombol sync kuning)."
        : "Server tidak terjangkau — acara disimpan lokal dulu dan akan terkirim otomatis."
    );
    setOpen(false);
    setNamaAcara(""); setNamaTuanRumah(""); setTanggal(""); setLokasi(""); setCatatan("");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    if (!namaAcara.trim() || namaAcara.trim().length < 2) { setErr("Nama acara minimal 2 huruf"); return; }
    if (!namaTuanRumah.trim() || namaTuanRumah.trim().length < 2) { setErr("Nama tuan rumah minimal 2 huruf"); return; }
    if (!tanggal) { setErr("Tanggal wajib diisi"); return; }
    setLoading(true);
    try {
      const { isOnline } = await import("@/lib/offline-sync");
      if (!isOnline()) {
        await saveOfflineQueue("offline");
        return;
      }
      let res: Response;
      try {
        res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ namaAcara, namaTuanRumah, tanggal, lokasi, catatan }),
        });
      } catch {
        await saveOfflineQueue("offline");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!navigator.onLine || res.status >= 500 || res.status === 408 || res.status === 429) {
          await saveOfflineQueue("server");
          return;
        }
        // Tampilkan field mana yang gagal jika VALIDATION_ERROR
        if ((data as { error?: string }).error === "VALIDATION_ERROR" && (data as { details?: { fieldErrors?: Record<string, string[]> } }).details?.fieldErrors) {
          const msgs = Object.entries((data as { details: { fieldErrors: Record<string, string[]> } }).details.fieldErrors)
            .map(([f, errs]) => `${f}: ${errs.join(", ")}`)
            .join(" | ");
          throw new Error(msgs || "Data tidak valid");
        }
        throw new Error((data as { error?: string }).error || JSON.stringify((data as { details?: unknown }).details) || "Gagal");
      }
      try {
        const { putCachedEvent } = await import("@/lib/db");
        await putCachedEvent({ ...(data as Record<string, unknown>), id: (data as { id: string }).id });
      } catch {}
      setOpen(false);
      setNamaAcara(""); setNamaTuanRumah(""); setTanggal(""); setLokasi(""); setCatatan("");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Gagal");
    } finally { setLoading(false); }
  }

  const inputCls = "w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow placeholder:text-[var(--on-surface-variant)]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-4 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
      >
        <Plus size={16} /> Buat Acara
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]/50 backdrop-blur-sm p-4 flex justify-center items-start sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Acara Baru"
        >
          <form
            onSubmit={submit}
            className="bg-[var(--surface-container-lowest)] rounded-2xl w-full max-w-md my-4 sm:my-8 border border-[var(--outline-variant)] shadow-[var(--shadow-elevation-3)] max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--outline-variant)] sticky top-0 bg-[var(--surface-container-lowest)] rounded-t-2xl z-10">
              <h3 className="font-semibold text-[var(--on-surface)]">Acara Baru</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
                className="w-8 h-8 rounded-lg hover:bg-[var(--surface-container)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3.5">
              <div>
                <label className="m3-section-title">Nama Acara *</label>
                <input value={namaAcara} onChange={e => setNamaAcara(e.target.value)} required placeholder="Pernikahan Budi & Ani" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="m3-section-title">Tuan Rumah *</label>
                <input value={namaTuanRumah} onChange={e => setNamaTuanRumah(e.target.value)} required placeholder="H. Slamet / Keluarga Bpk. Anto" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="m3-section-title">Tanggal *</label>
                <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="m3-section-title">Lokasi</label>
                <input value={lokasi} onChange={e => setLokasi(e.target.value)} placeholder="Balai Desa Krajan" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="m3-section-title">Catatan</label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Opsional"
                  rows={2}
                  className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow resize-none placeholder:text-[var(--on-surface-variant)]"
                />
              </div>
              <p className="text-xs text-[var(--on-surface-variant)]">Selalu tersambung saat ada internet. Kalau offline, acara disimpan di perangkat lalu terkirim otomatis (tombol sync kuning).</p>
              {info && (
                <p role="status" className="text-sm text-[var(--on-primary-container)] bg-[var(--primary-container)] p-3 rounded-xl border border-[var(--outline-variant)]">
                  {info}
                </p>
              )}
              {err && (
                <p role="alert" className="text-sm text-[var(--on-error-container)] bg-[var(--error-container)] p-3 rounded-xl border border-[var(--outline-variant)]">
                  {err}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 pb-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors"
              >
                Batal
              </button>
              <button
                disabled={loading}
                type="submit"
                className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
