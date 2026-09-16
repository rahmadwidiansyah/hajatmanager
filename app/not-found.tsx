import Link from "next/link";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
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

        <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm text-center">
          <div className="flex justify-center mb-4">
            <span className="w-12 h-12 rounded-full bg-[var(--surface-container)] flex items-center justify-center">
              <SearchX size={24} className="text-[var(--on-surface-variant)]" />
            </span>
          </div>
          <h1 className="font-semibold text-[var(--on-surface)]">Halaman tidak ketemu</h1>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Alamat yang kamu buka tidak ada atau sudah dipindah.
          </p>

          <div className="mt-6 space-y-2.5">
            <Link
              href="/dashboard"
              className="block w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm leading-[44px] hover:opacity-90 transition-opacity"
            >
              Ke Dashboard
            </Link>
            <Link
              href="/"
              className="block w-full h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] leading-[44px] hover:bg-[var(--surface-container)] transition-colors"
            >
              Ke Beranda
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
