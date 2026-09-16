"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Check, AlertCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useEffect } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  useEffect(() => {
    if (username.length < 3) { setUsernameStatus("idle"); return; }
    const t = setTimeout(async () => {
      setUsernameStatus("checking");
      const res = await fetch(`/api/users/check?username=${encodeURIComponent(username)}`);
      if (res.ok) {
        const j = await res.json();
        setUsernameStatus(j.available ? "available" : "taken");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal daftar");
      const login = await signIn("credentials", { email, password, redirect: false });
      if (login?.error) throw new Error("Daftar berhasil, silakan login");
      router.push("/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Gagal daftar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <BrandMark size={40} />
          </div>
          <Link href="/" className="inline-block font-bold text-xl text-[var(--on-surface)] tracking-tight">
            HajatManager
          </Link>
          <p className="mt-1.5 text-sm text-[var(--on-surface-variant)]">Buat akun baru</p>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-2xl border border-[var(--outline-variant)] p-7 shadow-sm">
          {/* Google */}
          <button
            onClick={() => { setGLoading(true); signIn("google", { callbackUrl: "/dashboard" }); }}
            disabled={gLoading}
            className="w-full h-11 rounded-xl border border-[var(--outline-variant)] flex items-center justify-center gap-2.5 text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] disabled:opacity-60 transition-colors"
          >
            {gLoading ? (
              <span className="w-[18px] h-[18px] rounded-full border-2 border-[var(--outline-variant)] border-t-[var(--primary)] animate-spin" aria-hidden />
            ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            )}
            {gLoading ? "Menghubungkan…" : "Daftar dengan Google"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
            <span className="text-xs text-[var(--on-surface-variant)]">atau</span>
            <div className="flex-1 h-px bg-[var(--outline-variant)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nama lengkap"
              className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
            />

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] text-sm">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                required
                placeholder="username"
                className="w-full h-11 pl-8 pr-24 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                {usernameStatus === "checking" && <span className="text-[var(--on-surface-variant)]">Cek...</span>}
                {usernameStatus === "available" && <span className="text-[var(--primary)] flex items-center gap-1"><Check size={14} />Tersedia</span>}
                {usernameStatus === "taken" && <span className="text-[var(--error)] flex items-center gap-1"><AlertCircle size={14} />Dipakai</span>}
              </span>
            </div>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="Email"
              className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              placeholder="Password (min 6 karakter)"
              className="w-full h-11 px-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-shadow"
            />

            {err && (
              <p className="text-sm text-[var(--error)] bg-[var(--error-container)] p-3 rounded-xl border border-[var(--outline-variant)]">
                {err}
              </p>
            )}

            <button
              disabled={loading || usernameStatus === "taken"}
              type="submit"
              className="w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Memproses..." : "Buat Akun"}
            </button>
          </form>
        </div>

        <p className="text-sm text-center mt-5 text-[var(--on-surface-variant)]">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-[var(--primary)] font-medium hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
