"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandMark size={40} />
          </div>
          <span className="inline-block font-bold text-xl text-[var(--on-surface)] tracking-tight">
            HajatManager
          </span>
        </div>

        <div
          role="alert"
          className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm text-center"
        >
          <div className="flex justify-center mb-4">
            <span className="w-12 h-12 rounded-full bg-[var(--error-container)] flex items-center justify-center">
              <AlertCircle size={24} className="text-[var(--error)]" />
            </span>
          </div>
          <h1 className="font-semibold text-[var(--on-surface)]">Ada yang salah</h1>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Halaman gagal dimuat. Coba lagi, atau kembali ke dashboard.
          </p>

          <div className="mt-6 space-y-2.5">
            <button
              onClick={() => reset()}
              className="block w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Coba lagi
            </button>
            <Link
              href="/dashboard"
              className="block w-full h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] leading-[44px] hover:bg-[var(--surface-container)] transition-colors"
            >
              Ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
