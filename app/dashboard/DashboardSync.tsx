"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudCheck, RefreshCw } from "lucide-react";

export function DashboardSync() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      router.refresh();
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm text-[var(--on-surface-variant)]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-600 text-white"
            aria-hidden
          >
            <CloudCheck size={15} />
          </span>
          <p className="truncate text-xs sm:text-sm">
            Web 100% Online — Seluruh data terhubung langsung ke server
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 px-3 rounded-full bg-[var(--surface-container)] text-[var(--on-surface)] text-xs font-medium hover:bg-[var(--surface-container-high)] disabled:opacity-50 shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
    </div>
  );
}
