"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { pinAttemptsLeft, pinLockoutUntil, verifyOfflinePin } from "@/lib/offline-pin";

/** Layar kunci PIN untuk akses offline. onUnlock dipanggil saat PIN benar. */
export function OfflineLock({ eventName, onUnlock }: { eventName?: string; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const t = window.setInterval(() => {
      const left = pinLockoutUntil() - Date.now();
      setCooldownMs(left > 0 ? left : 0);
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  async function submit(nextPin: string) {
    if (checking || cooldownMs > 0 || nextPin.length !== 6) return;
    setChecking(true);
    setError(null);
    try {
      const r = await verifyOfflinePin(nextPin);
      if (r.ok) {
        onUnlock();
        return;
      }
      if (r.reason === "no-pin") {
        setError("Belum ada PIN di perangkat ini. Online-kan dulu lalu atur PIN di Akun.");
      } else if (r.reason === "locked") {
        setError(`Terlalu banyak salah. Coba lagi dalam ${Math.ceil((r.retryInMs ?? 0) / 1000)} detik.`);
      } else {
        const left = pinAttemptsLeft();
        setError(left > 0 ? `PIN salah. Sisa ${left}x percobaan.` : "PIN salah.");
      }
      setPin("");
      inputRef.current?.focus();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[var(--background)] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--surface-container)] border border-[var(--outline-variant)] flex items-center justify-center">
          <Lock size={24} className="text-[var(--on-surface-variant)]" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[var(--on-surface)]">Terkunci offline</h1>
        <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
          {eventName ? (
            <>Masukkan PIN untuk membuka <strong className="text-[var(--on-surface)]">{eventName}</strong> tanpa koneksi.</>
          ) : (
            <>Masukkan PIN untuk membuka data offline.</>
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(pin);
          }}
          className="mt-5"
        >
          <input
            ref={inputRef}
            value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(v);
              if (v.length === 6) submit(v);
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••••"
            aria-label="PIN 6 digit"
            disabled={checking || cooldownMs > 0}
            className="w-full h-14 text-center text-2xl font-bold tracking-[0.5em] rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          {cooldownMs > 0 && !error && (
            <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
              Tunggu {Math.ceil(cooldownMs / 1000)} detik…
            </p>
          )}
          <button
            type="submit"
            disabled={checking || pin.length !== 6 || cooldownMs > 0}
            className="mt-4 w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {checking ? "Memeriksa…" : "Buka"}
          </button>
        </form>
        <Link
          href="/dashboard"
          className="mt-3 inline-block text-sm text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:underline"
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
