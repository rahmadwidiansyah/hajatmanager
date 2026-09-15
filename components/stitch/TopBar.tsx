"use client";
import Link from "next/link";
import { ArrowLeft, Wallet, Eye, EyeOff, Download, CloudUpload, CloudCheck, Zap } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TopBar({
  namaAcara,
  tanggal,
  lokasi,
  myRole,
  totalTamu: _totalTamu,
  totalNominal,
  kasirName,
  mejaLabel,
  mejaList,
  onMejaChange,
  onSearch: _onSearch,
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
  // Detail tak penting saat input (tanggal/lokasi/role/sync-time) pindah ke Setting.
  // Disimpan sebagai tooltip agar tetap aksesibel tanpa makan ruang (progressive disclosure M3).
  void _totalTamu;
  void _onSearch;
  void myRole;
  const detailTitle = `${namaAcara}${tanggal ? ` · ${new Date(tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""}${lokasi ? ` · ${lokasi}` : ""}${lastSyncAt ? ` · sync ${lastSyncAt}` : ""}`;
  const pending = typeof pendingCount === "number" ? pendingCount : 0;

  const mejaSelect = (
    <select
      value={mejaLabel || ""}
      onChange={(e) => onMejaChange(e.target.value)}
      disabled={!mejaLabel}
      aria-label="Pilih meja"
      className="shrink-0 h-7 max-w-[68px] px-1.5 rounded-full text-xs font-semibold bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] border border-[var(--outline-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
  );

  // 1 tombol sync gabungan: tap = refresh/sync now, tahan/double-click = toggle auto.
  const syncTitle = `Sync${autoSync ? " auto ON" : " manual"}${pending > 0 ? ` · ${pending} pending` : ""}${lastSyncAt ? ` · terakhir ${lastSyncAt}` : ""} (klik = sync sekarang, klik 2x = auto on/off)`;
  const syncBtn = (
    <button
      onClick={onRefresh}
      onDoubleClick={onToggleAutoSync}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleAutoSync?.();
      }}
      disabled={isSyncing}
      aria-label="Sync"
      aria-pressed={!!autoSync}
      title={syncTitle}
      className={`relative shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center disabled:opacity-50 ${autoSync ? "bg-[var(--primary-container)] border-[var(--outline-variant)] text-[var(--on-primary-container)]" : "bg-[var(--surface-container)] border-[var(--outline-variant)] text-[var(--on-surface-variant)]"}`}
    >
      {isSyncing ? (
        <CloudUpload size={14} className="animate-pulse" />
      ) : pending > 0 ? (
        <CloudUpload size={14} />
      ) : (
        <CloudCheck size={14} />
      )}
      {pending > 0 && (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-[var(--warning)] text-white text-[10px] leading-4 text-center font-semibold">
          {pending > 9 ? "9+" : pending}
        </span>
      )}
      {autoSync && !isSyncing && (
        <span aria-hidden className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[var(--primary)] flex items-center justify-center">
          <Zap size={8} className="text-white" />
        </span>
      )}
    </button>
  );

  const nominalPill = (
    <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-xs bg-[var(--primary-container)] text-[var(--on-primary-container)] border border-[var(--outline-variant)] font-semibold min-w-0">
      <Wallet size={14} className="shrink-0" />
      <span className="truncate">{hideNominal ? "Rp ••••••" : formatRupiah(totalNominal)}</span>
      <button type="button" onClick={onToggleHideNominal} aria-label={hideNominal ? "Tampilkan nominal" : "Sembunyikan nominal"} className="w-5 h-5 rounded-full bg-[var(--surface-container-lowest)]/60 flex items-center justify-center shrink-0">
        {hideNominal ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );

  const kasirChip = (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs bg-[var(--surface-container)] border border-[var(--outline-variant)] min-w-0 max-w-[130px]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--tertiary)] animate-pulse shrink-0" />
      <span className="truncate text-[var(--on-surface-variant)]">{kasirName}</span>
    </span>
  );

  return (
    <div
      className={`bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] sticky top-0 z-30 ${
        isCompact
          ? "rounded-2xl px-2 py-1.5 sm:px-4 sm:py-2 mb-2 sm:mb-4"
          : "rounded-2xl px-2 py-1.5 sm:px-4 sm:py-2 mb-3 sm:mb-4"
      }`}
      style={{ ["--appbar-h" as string]: isCompact ? "76px" : "68px" }}
    >
      {/* ===== MOBILE (tab Pemberian): baris 1 nav + baris 2 nominal/kasir ===== */}
      {isCompact ? (
        <div className="sm:hidden min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 min-h-8">
            <Link href="/dashboard" aria-label="Kembali" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--surface-container)]">
              <ArrowLeft size={16} className="text-[var(--on-surface)]" />
            </Link>
            <p title={detailTitle} className="flex-1 min-w-0 text-sm font-semibold leading-none truncate text-[var(--on-surface)]">{namaAcara}</p>
            {mejaSelect}
            {syncBtn}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
            <div className="min-w-0 max-w-[60%]">{nominalPill}</div>
            <div className="min-w-0 flex-1">{kasirChip}</div>
          </div>
        </div>
      ) : null}

      {/* ===== MOBILE (tab lain): 1 baris minimal, tanpa search global ===== */}
      {!isCompact ? (
        <div className="sm:hidden flex items-center gap-1.5 min-w-0 min-h-8">
          <Link href="/dashboard" aria-label="Kembali" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--surface-container)]">
            <ArrowLeft size={16} className="text-[var(--on-surface)]" />
          </Link>
          <p title={detailTitle} className="flex-1 min-w-0 text-sm font-semibold leading-none truncate text-[var(--on-surface)]">{namaAcara}</p>
          {mejaSelect}
          {syncBtn}
        </div>
      ) : null}

      {/* ===== DESKTOP: 1 baris — judul + info penting + aksi (tanpa breadcrumb/tanggal/search ganda) ===== */}
      <div className="hidden sm:flex items-center gap-2 min-w-0">
        <Link href="/dashboard" aria-label="Kembali ke dashboard" className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--surface-container)]">
          <ArrowLeft size={16} className="text-[var(--on-surface-variant)]" />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p title={detailTitle} className="font-semibold text-[var(--on-surface)] truncate max-w-[220px]">{namaAcara}</p>
          {mejaSelect}
          <div className="min-w-0 max-w-[220px] hidden md:block">{nominalPill}</div>
          <div className="min-w-0 hidden lg:block">{kasirChip}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />
          <button onClick={onExportClick} className="h-9 px-3 rounded-xl bg-[var(--surface-container)] border border-[var(--outline-variant)] text-[var(--on-surface)] text-sm flex items-center gap-1.5 hover:bg-[var(--surface-container-high)] transition-colors">
            <Download size={16} /> Export
          </button>
          {syncBtn}
        </div>
      </div>
    </div>
  );
}
