"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { OfflineLock } from "@/components/OfflineLock";
import { setEventUnlocked } from "@/lib/offline-pin";

// Fase 4: pintu masuk offline langsung — di-precache SW.
// Dipakai dari bookmark/link langsung saat offline menuju acara yang
// dokumennya sudah ter-cache (kalau belum, fallback offline.html yang tampil).
function UnlockInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("event") || "";

  if (!eventId) {
    return (
      <div className="min-h-dvh bg-[var(--background)] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--surface-container)] border border-[var(--outline-variant)] flex items-center justify-center">
            <KeyRound size={24} className="text-[var(--on-surface-variant)]" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-[var(--on-surface)]">Buka kunci offline</h1>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Tautan tidak lengkap. Buka halaman acara dulu saat online, atau kembali ke Dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-11 px-6 items-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <OfflineLock
      onUnlock={() => {
        setEventUnlocked(eventId);
        // Navigasi penuh (bukan router.push) agar SW menyajikan dokumen acara
        // yang ter-cache — RSC client-nav tidak bisa jalan saat offline.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/events/${encodeURIComponent(eventId)}`;
      }}
    />
  );
}

export default function UnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[var(--background)] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <UnlockInner />
    </Suspense>
  );
}
