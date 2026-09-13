"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("tester@test.com");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setErr("Email atau password salah");
    else router.push("/dashboard");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandMark size={40} />
          </div>
          <Link href="/" className="inline-block font-bold text-xl text-[var(--on-surface)] tracking-tight">
            HajatManager
          </Link>
          <p className="mt-1.5 text-sm text-[var(--on-surface-variant)]">Masuk ke akun Anda</p>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm">
          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full h-11 rounded-xl border border-[var(--outline-variant)] flex items-center justify-center gap-2.5 text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Lanjutkan dengan Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
            <span className="text-xs text-[var(--on-surface-variant)]">atau</span>
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="Email"
                className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="Password"
                className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
              />
            </div>

            {err && (
              <p className="text-sm text-[var(--error)] bg-[var(--error-container)] p-3 rounded-xl border border-[var(--outline-variant)]">
                {err}
              </p>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>

        <p className="text-sm text-center mt-5 text-[var(--on-surface-variant)]">
          Belum punya akun?{" "}
          <Link href="/register" className="text-[var(--primary)] font-medium hover:underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  );
}
