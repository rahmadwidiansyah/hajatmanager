"use client";

import { useState } from "react";
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
  const [mode, setMode] = useState<"ONLINE" | "OFFLINE">("ONLINE");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namaAcara, namaTuanRumah, tanggal, lokasi, catatan, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || JSON.stringify(data.details) || "Gagal");
      setOpen(false);
      setNamaAcara(""); setNamaTuanRumah(""); setTanggal(""); setLokasi(""); setCatatan(""); setMode("ONLINE");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Gagal");
    } finally { setLoading(false); }
  }

  const inputCls = "w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow placeholder:text-[var(--on-surface-variant)]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
      >
        <Plus size={15} /> Buat Acara
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submit}
            className="bg-[var(--surface-container-lowest)] rounded-2xl w-full max-w-md border border-[var(--outline-variant)] shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--outline-variant)]">
              <h3 className="font-semibold text-[var(--on-surface)]">Acara Baru</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-[var(--surface-container)] flex items-center justify-center text-[var(--on-surface-variant)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Nama Acara *</label>
                <input value={namaAcara} onChange={e => setNamaAcara(e.target.value)} required placeholder="Pernikahan Budi & Ani" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Tuan Rumah *</label>
                <input value={namaTuanRumah} onChange={e => setNamaTuanRumah(e.target.value)} required placeholder="H. Slamet / Keluarga Bpk. Anto" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Tanggal *</label>
                <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Lokasi</label>
                <input value={lokasi} onChange={e => setLokasi(e.target.value)} placeholder="Balai Desa Krajan" className={`mt-1.5 ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Catatan</label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Opsional"
                  rows={2}
                  className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow resize-none placeholder:text-[var(--on-surface-variant)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--on-surface-variant)] uppercase tracking-wide">Mode Acara</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMode("ONLINE")} className={`h-11 rounded-xl border text-sm font-medium transition-colors ${mode === "ONLINE" ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--surface-container)] text-[var(--on-surface)] border-[var(--outline-variant)]"}`}>Online</button>
                  <button type="button" onClick={() => setMode("OFFLINE")} className={`h-11 rounded-xl border text-sm font-medium transition-colors ${mode === "OFFLINE" ? "bg-amber-500 text-white border-amber-500" : "bg-[var(--surface-container)] text-[var(--on-surface)] border-[var(--outline-variant)]"}`}>Offline</button>
                </div>
                <p className="text-xs text-[var(--on-surface-variant)] mt-1.5">{mode === "OFFLINE" ? "Offline: data di lokal dulu, multi-anggota nonaktif sampai Sync ke Server." : "Online: multi-anggota aktif, sync otomatis."}</p>
              </div>
              {err && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800">
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
                className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
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
