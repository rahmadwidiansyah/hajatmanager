"use client";
import Link from "next/link";
import { ArrowLeft, Wallet, Eye, EyeOff, Download, RefreshCw, Zap, ZapOff } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TopBar({
  namaAcara,
  tanggal,
  lokasi,
  myRole,
  totalTamu,
  totalNominal,
  kasirName,
  mejaLabel,
  mejaList,
  onMejaChange,
  onSearch,
  onExportClick,
  autoSync,
  isSyncing,
  lastSyncAt,
  pendingCount,
  onToggleAutoSync,
  onRefresh,
  hideNominal,
  onToggleHideNominal,
  compact,
}: {
  namaAcara: string;
  tanggal: string;
  lokasi?: string;
  myRole: string;
  totalTamu: number;
  totalNominal: number;
  kasirName: string;
  mejaLabel: string | null;
  mejaList?: string[];
  onMejaChange: (v: string) => void;
  onSearch: (v: string) => void;
  onExportClick?: () => void;
  autoSync?: boolean;
  isSyncing?: boolean;
  lastSyncAt?: string | null;
  pendingCount?: number;
  onToggleAutoSync?: () => void;
  onRefresh?: () => void;
  hideNominal?: boolean;
  onToggleHideNominal?: () => void;
  compact?: boolean;
}) {
  const list = mejaList && mejaList.length ? mejaList : ["MEJA-1", "MEJA-2", "MEJA-3"];
  const isCompact = !!compact;

  return (
    <div
      className={`bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-container-lowest)]/90 ${
        isCompact
          ? "rounded-none -mx-3 sm:-mx-4 px-2 py-1 sm:rounded-2xl sm:mx-0 sm:px-4 sm:py-3 mb-2 sm:mb-4 border-x-0 sm:border-x"
          : "rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4"
      }`}
    >
      {/* ===== MOBILE ULTRA-COMPACT — single row ~40px ===== */}
      {isCompact ? (
        <div className="flex items-center gap-1.5 sm:hidden min-w-0 h-8">
          <Link href="/dashboard" aria-label="Kembali" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--surface-container)]">
            <ArrowLeft size={15} className="text-[var(--on-surface)]" />
          </Link>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <p className="flex-1 min-w-0 text-[13px] font-semibold leading-none truncate text-[var(--on-surface)]">{namaAcara}</p>
            <span className="hidden xs:inline text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">{myRole}</span>
            {typeof pendingCount === "number" && pendingCount > 0 && (
              <span className="shrink-0 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-medium">{pendingCount}</span>
            )}
          </div>
          <select
            value={mejaLabel || ""}
            onChange={(e) => onMejaChange(e.target.value)}
            disabled={!mejaLabel}
            className="shrink-0 h-7 max-w-[84px] px-1.5 rounded-full text-[11px] font-semibold bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] focus:outline-none"
          >
            {mejaLabel ? (
              <>
                {list.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="Custom">Custom…</option>
              </>
            ) : (
              <option>—</option>
            )}
          </select>
          <button onClick={onToggleAutoSync} aria-label="Auto sync" className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center ${autoSync ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-[var(--surface-container)] border-[var(--outline-variant)] text-[var(--on-surface-variant)]"}`}>
            {autoSync ? <Zap size={12} /> : <ZapOff size={12} />}
          </button>
          <button onClick={onRefresh} disabled={isSyncing} aria-label="Refresh" className="shrink-0 w-7 h-7 rounded-full bg-[var(--surface-container)] border border-[var(--outline-variant)] flex items-center justify-center disabled:opacity-50">
            <RefreshCw size={11} className={`${isSyncing ? "animate-spin" : ""} text-[var(--on-surface-variant)]`} />
          </button>
        </div>
      ) : null}

      {/* Detail strip (hanya desktop saat compact) — nominal/kasir/tanggal tidak ikut bikin header mobile tinggi */}
      {isCompact ? (
        <div className="hidden sm:flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)]">
            <Link href="/dashboard" className="flex items-center gap-1 hover:text-[var(--primary)]">
              <ArrowLeft size={14} /> Acara
            </Link>
            <span>/</span>
            <span className="font-semibold text-[var(--on-surface)] truncate">{namaAcara}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 px-2.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{myRole}</span>
            <span className="text-xs text-[var(--on-surface-variant)]">
              {new Date(tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} {lokasi ? `· ${lokasi}` : ""}
            </span>
            <span className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              <Wallet size={12} />
              <span>{hideNominal ? "Rp ••••••" : formatRupiah(totalNominal)}</span>
              <button type="button" onClick={onToggleHideNominal} className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center">
                {hideNominal ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            </span>
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="max-w-[80px] truncate text-[var(--on-surface-variant)]">{kasirName}</span>
            </span>
            <select value={mejaLabel || ""} onChange={(e) => onMejaChange(e.target.value)} disabled={!mejaLabel} className="h-6 px-2.5 rounded-full text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)]">
              {mejaLabel ? (
                <>
                  {list.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="Custom">Custom…</option>
                </>
              ) : (
                <option>Memuat…</option>
              )}
            </select>
          </div>
          <div className="flex items-center gap-1.5 self-end">
            <div className="relative hidden sm:block">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input onChange={(e) => onSearch(e.target.value)} placeholder="Cari..." className="w-48 h-9 pl-8 pr-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <ThemeToggle />
            <button onClick={onExportClick} className="h-9 px-3 rounded-xl bg-[var(--surface-container)] border text-sm flex items-center gap-1.5">
              <Download size={14} /> Export
            </button>
            <button onClick={onToggleAutoSync} className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 ${autoSync ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)]"}`}>
              {autoSync ? <Zap size={13} /> : <ZapOff size={13} />} {autoSync ? "Auto" : "Manual"}
            </button>
            <button onClick={onRefresh} disabled={isSyncing} className="w-9 h-9 rounded-xl bg-[var(--surface-container)] border flex items-center justify-center disabled:opacity-50">
              <RefreshCw size={14} className={isSyncing ? "animate-spin text-[var(--on-surface-variant)]" : "text-[var(--on-surface-variant)]"} />
            </button>
          </div>
        </div>
      ) : (
        /* ===== FULL HEADER (non-compact) — dipakai di tab lain ===== */
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)] mb-2">
              <Link href="/dashboard" className="flex items-center gap-1 hover:text-[var(--primary)]">
                <ArrowLeft size={14} /> Acara
              </Link>
              <span>/</span>
              <span className="font-semibold text-[var(--on-surface)] truncate">{namaAcara}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-6 px-2.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">{myRole}</span>
              <span className="text-xs text-[var(--on-surface-variant)]">
                {new Date(tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} {lokasi ? `· ${lokasi}` : ""}
              </span>
              <span className="inline-flex items-center gap-1 h-6 pl-2.5 pr-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                <Wallet size={12} />
                <span>{hideNominal ? "Rp ••••••" : formatRupiah(totalNominal)}</span>
                <button type="button" onClick={onToggleHideNominal} className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center">
                  {hideNominal ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </span>
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="max-w-[80px] truncate text-[var(--on-surface-variant)]">{kasirName}</span>
              </span>
              <select value={mejaLabel || ""} onChange={(e) => onMejaChange(e.target.value)} disabled={!mejaLabel} className="h-6 px-2.5 rounded-full text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)]">
                {mejaLabel ? (
                  <>
                    {list.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="Custom">Custom…</option>
                  </>
                ) : (
                  <option>Memuat…</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative hidden sm:block">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input onChange={(e) => onSearch(e.target.value)} placeholder="Cari..." className="w-36 sm:w-48 h-9 pl-8 pr-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <button onClick={onExportClick} className="h-9 w-9 sm:w-auto sm:px-3 rounded-xl bg-[var(--surface-container)] border text-sm flex items-center justify-center sm:gap-1.5">
                <Download size={14} />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button onClick={onToggleAutoSync} className={`h-9 w-9 sm:w-auto sm:px-3 rounded-xl border flex items-center justify-center sm:gap-1.5 text-xs font-medium ${autoSync ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[var(--surface-container)] text-[var(--on-surface-variant)]"}`}>
                {autoSync ? <Zap size={13} /> : <ZapOff size={13} />}
                <span className="hidden sm:inline">{autoSync ? "Auto" : "Manual"}</span>
              </button>
              {typeof pendingCount === "number" && pendingCount > 0 ? <span className="text-xs text-amber-600 hidden md:inline">{pendingCount} pending</span> : lastSyncAt ? <span className="text-xs text-[var(--on-surface-variant)] hidden md:inline">{lastSyncAt}</span> : null}
              <button onClick={onRefresh} disabled={isSyncing} className="w-9 h-9 rounded-xl bg-[var(--surface-container)] border flex items-center justify-center disabled:opacity-50">
                <RefreshCw size={14} className={`${isSyncing ? "animate-spin" : ""} text-[var(--on-surface-variant)]`} />
              </button>
            </div>
          </div>
          <div className="relative sm:hidden mt-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input onChange={(e) => onSearch(e.target.value)} placeholder="Cari tamu..." className="w-full h-9 pl-8 pr-3 rounded-xl bg-[var(--surface-container)] border text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
