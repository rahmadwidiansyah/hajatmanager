import Link from "next/link";
import { BookOpen, Zap, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {/* Nav */}
      <header className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] sticky top-0 z-30 backdrop-blur-sm bg-opacity-95">
        <div className="mx-auto max-w-4xl px-5 h-14 flex items-center justify-between">
          <span className="font-bold text-[15px] tracking-tight text-[var(--on-surface)]">Kondangan</span>
          <nav className="flex gap-2 items-center">
            <ThemeToggle />
            <Link href="/login" className="h-9 px-4 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors flex items-center">
              Masuk
            </Link>
            <Link href="/register" className="h-9 px-4 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center">
              Daftar
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-4xl px-5 py-16 w-full">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-800 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Multi-admin • Real-time sync
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[var(--on-surface)] tracking-tight leading-tight">
            Catat hajat<br className="hidden sm:block" /> lebih rapi
          </h1>
          <p className="mt-4 text-[var(--on-surface-variant)] text-lg max-w-xl mx-auto leading-relaxed">
            Buku tamu digital, catat pemberian satset, rekap per desa &amp; metode, export Excel &amp; PDF.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/register" className="h-11 px-6 rounded-xl bg-[var(--primary)] text-white font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm">
              <Zap size={16} /> Mulai Sekarang
            </Link>
            <Link href="/login" className="h-11 px-6 rounded-xl border border-[var(--outline-variant)] text-[var(--on-surface)] text-sm flex items-center hover:bg-[var(--surface-container)] transition-colors">
              Sudah punya akun
            </Link>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: <BookOpen size={18} className="text-emerald-600" />,
              title: "Buku Tamu",
              desc: "Import undangan, jadi master suggest. Ketik 2 huruf → nama + alamat auto-fill.",
            },
            {
              icon: <Zap size={18} className="text-emerald-600" />,
              title: "Input Satset",
              desc: "Chip alamat & nominal Top 4, wajib catatan bila duplikat, kode kasir per meja.",
            },
            {
              icon: <Users size={18} className="text-emerald-600" />,
              title: "Multi-Admin",
              desc: "Tambah panitia tak terbatas, filter per meja & kasir, rekap & export kapan saja.",
            },
          ].map((f) => (
            <div key={f.title} className="p-5 rounded-2xl bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
                {f.icon}
              </div>
              <h3 className="font-semibold text-sm text-[var(--on-surface)]">{f.title}</h3>
              <p className="text-xs text-[var(--on-surface-variant)] mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Tags */}
        <div className="mt-10 flex flex-wrap gap-2 justify-center">
          {["Export Excel & PDF", "Auth Google & Email", "Audit Log", "PostgreSQL + Prisma"].map((t) => (
            <span key={t} className="px-3 py-1 rounded-full text-xs text-[var(--on-surface-variant)] border border-[var(--outline-variant)] bg-[var(--surface-container-low)]">
              {t}
            </span>
          ))}
        </div>
      </main>

      <footer className="py-5 text-center text-xs text-[var(--on-surface-variant)] border-t border-[var(--outline-variant)]">
        Hajat Manager — dibuat untuk hajatan Indonesia
      </footer>
    </div>
  );
}
