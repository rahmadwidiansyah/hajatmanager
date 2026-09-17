"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function DeviceGoogleStartClient({
  state,
  port,
  device,
}: {
  state: string;
  port: string;
  device: string;
}) {
  const [busy, setBusy] = useState(false);

  const valid =
    state.length >= 20 && /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

  function next() {
    if (!valid) return;
    setBusy(true);
    const q = new URLSearchParams({ state, port });
    if (device) q.set("device", device);
    signIn("google", { callbackUrl: `/device/google/finish?${q.toString()}` });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandMark size={40} />
          </div>
          <p className="font-bold text-xl text-[var(--on-surface)] tracking-tight">
            HajatManager
          </p>
          <p className="mt-1.5 text-sm text-[var(--on-surface-variant)]">
            Login Google untuk aplikasi desktop
          </p>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm">
          {device && (
            <p className="text-sm text-[var(--on-surface-variant)] mb-4 text-center">
              Perangkat: <span className="font-medium text-[var(--on-surface)]">{device}</span>
            </p>
          )}
          {!valid ? (
            <p className="text-sm text-[var(--error)] bg-[var(--error-container)] p-3 rounded-xl border border-[var(--outline-variant)]">
              Tautan tidak valid — buka lagi dari aplikasi desktop (tombol Google),
              jangan ketik URL ini manual.
            </p>
          ) : (
            <>
              <button
                onClick={next}
                disabled={busy}
                className="w-full h-11 rounded-xl border border-[var(--outline-variant)] flex items-center justify-center gap-2.5 text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] disabled:opacity-60 transition-colors"
              >
                {busy ? (
                  <span className="w-[18px] h-[18px] rounded-full border-2 border-[var(--outline-variant)] border-t-[var(--primary)] animate-spin" aria-hidden />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {busy ? "Menghubungkan…" : "Lanjutkan dengan Google"}
              </button>
              <p className="mt-4 text-xs text-[var(--on-surface-variant)] text-center">
                Setelah berhasil, browser kembali otomatis ke aplikasi.
                Biarkan aplikasi tetap terbuka.
              </p>
            </>
          )}
          <p className="text-sm text-center mt-5 text-[var(--on-surface-variant)]">
            <Link href="/login" className="text-[var(--primary)] font-medium hover:underline">
              Ke halaman login biasa
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
