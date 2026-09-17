"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

/**
 * Redirect otomatis ke loopback app + fallback kode manual
 * (untuk kasus browser tak bisa mencapai 127.0.0.1:port).
 */
export default function FinishClient({
  code,
  state,
  port,
  device,
}: {
  code: string;
  state: string;
  port: string;
  device: string;
}) {
  const [copied, setCopied] = useState(false);

  const target = `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(
    code
  )}&state=${encodeURIComponent(state)}`;

  useEffect(() => {
    const t = setTimeout(() => {
      window.location.replace(target);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect sekali saat mount
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-3">
          <BrandMark size={40} />
        </div>
        <p className="font-bold text-xl text-[var(--on-surface)]">Login berhasil ✓</p>
        {device && (
          <p className="mt-1.5 text-sm text-[var(--on-surface-variant)]">
            Perangkat: <span className="font-medium text-[var(--on-surface)]">{device}</span>
          </p>
        )}
        <div className="mt-6 bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm">
          <p className="text-sm text-[var(--on-surface-variant)]">
            Mengembalikan ke aplikasi…
          </p>
          <a
            href={target}
            className="mt-4 inline-flex h-11 px-6 items-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Kembali ke aplikasi
          </a>
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
            <span className="text-xs text-[var(--on-surface-variant)]">
              atau salin manual
            </span>
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
          </div>
          <p className="text-xs text-[var(--on-surface-variant)] mb-2">
            Aplikasi tidak terbuka otomatis? Tempel kode ini di aplikasi:
          </p>
          <button
            onClick={copy}
            title="Klik untuk salin"
            className="w-full p-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)] font-mono text-xs break-all text-[var(--on-surface)] hover:bg-[var(--surface-container-high)] transition-colors"
          >
            {code}
          </button>
          <button
            onClick={copy}
            className="mt-2 h-10 px-4 inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary-container)] transition-colors"
          >
            {copied ? (
              <>
                <Check size={16} /> Tersalin
              </>
            ) : (
              "Salin kode"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
