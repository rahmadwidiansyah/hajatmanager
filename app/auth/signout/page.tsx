"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export default function SignOutPage() {
  const [loading, setLoading] = useState(false);

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
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="signout-title"
          aria-describedby="signout-desc"
          className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm text-center"
        >
          <div className="flex justify-center mb-4">
            <span className="w-12 h-12 rounded-full bg-[var(--error-container)] flex items-center justify-center">
              <LogOut size={24} className="text-[var(--error)]" />
            </span>
          </div>
          <h1 id="signout-title" className="font-semibold text-[var(--on-surface)]">
            Keluar dari HajatManager?
          </h1>
          <p id="signout-desc" className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Sesi login di perangkat ini diakhiri. Data yang sudah tersinkron aman di server.
          </p>

          <div className="mt-6 space-y-2.5">
            <button
              onClick={() => {
                setLoading(true);
                signOut({ callbackUrl: "/" });
              }}
              disabled={loading}
              className="block w-full h-11 rounded-xl bg-[var(--error)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {loading ? "Keluar…" : "Ya, Keluar"}
            </button>
            <Link
              href="/dashboard"
              className="block w-full h-11 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] leading-[44px] hover:bg-[var(--surface-container)] transition-colors"
            >
              Batal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
