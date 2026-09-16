"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

const MESSAGES: Record<string, { title: string; desc: string }> = {
  Configuration: {
    title: "Login Google belum dikonfigurasi",
    desc: "Server belum melengkapi konfigurasi login Google. Silakan masuk dengan email dulu, atau hubungi admin.",
  },
  OAuthCallback: {
    title: "Google menolak login",
    desc: "Terjadi kesalahan saat kembali dari Google. Coba lagi atau pakai akun lain.",
  },
  AccessDenied: {
    title: "Akses ditolak",
    desc: "Kamu membatalkan izin di Google. Coba lagi bila ingin lanjut.",
  },
  Verification: {
    title: "Link verifikasi bermasalah",
    desc: "Link sudah kedaluwarsa atau pernah dipakai. Minta link baru.",
  },
};

function ErrorBody() {
  const params = useSearchParams();
  const code = params.get("error") ?? "";
  const msg = MESSAGES[code] ?? {
    title: "Login gagal",
    desc: "Terjadi kesalahan tak dikenal saat login. Coba lagi.",
  };
  const showEmailFallback = code === "Configuration" || code === "";

  return (
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
        <h1 className="font-semibold text-[var(--on-surface)]">{msg.title}</h1>
        <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{msg.desc}</p>

        <div className="mt-6 space-y-2.5">
          <Link
            href="/login"
            className="block w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm leading-[44px] hover:opacity-90 transition-opacity"
          >
            {showEmailFallback ? "Masuk dengan email" : "Coba lagi"}
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
  );
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4">
      <Suspense>
        <ErrorBody />
      </Suspense>
    </div>
  );
}
