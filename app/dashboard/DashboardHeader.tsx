"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import { User, LogOut, ChevronDown, Sun, Moon } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";

type Props = {
  user: { name?: string | null; username?: string | null; email?: string | null; image?: string | null; avatar?: string | null; profilePicture?: string | null; id: string };
  displayName: string;
};

export function DashboardHeader({ user, displayName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { mode, systemMode, setMode } = useColorScheme();
  // Hydration-safe: sebelum mount, paksa varian terang agar sama dengan SSR.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- pola mounted guard standar anti-hydration-mismatch
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && (mode === "system" ? systemMode : mode) === "dark";

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header className="w-full bg-[var(--surface-container-lowest)] border-b border-[var(--outline-variant)] sticky top-0 z-30">
      <div className="page-shell h-14 flex justify-between items-center">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-sm tracking-tight text-[var(--on-surface)]">
          <BrandMark />HajatManager
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-xl border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] transition-colors"
            >
              <Avatar user={user} size={28} />
              <span className="text-sm text-[var(--on-surface)] hidden sm:inline max-w-[120px] truncate">
                {displayName}
              </span>
              <ChevronDown size={16} className="text-[var(--on-surface-variant)]" />
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-52 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-xl shadow-[var(--shadow-elevation-2)] py-1 text-sm overflow-hidden z-40">
                <div className="px-4 py-3 border-b border-[var(--outline-variant)]">
                  <p className="font-semibold text-[var(--on-surface)] truncate">{user.name || user.email}</p>
                  <p className="text-xs text-[var(--on-surface-variant)] truncate mt-0.5">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--surface-container)] text-[var(--on-surface)] transition-colors"
                >
                  <User size={16} className="text-[var(--on-surface-variant)]" /> Akun Saya
                </Link>
                <button
                  onClick={() => setMode(isDark ? "light" : "dark")}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--surface-container)] text-[var(--on-surface)] transition-colors"
                >
                  {isDark ? (
                    <Sun size={16} className="text-[var(--warning)]" />
                  ) : (
                    <Moon size={16} className="text-[var(--on-surface-variant)]" />
                  )}
                  {isDark ? "Mode terang" : "Mode gelap"}
                </button>
                <Link
                  href="/api/auth/signout"
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--error-container)] text-[var(--error)] transition-colors"
                >
                  <LogOut size={16} /> Keluar
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
