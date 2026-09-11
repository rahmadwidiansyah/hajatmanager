"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { User, LogOut, ChevronDown } from "lucide-react";

type Props = {
  user: { name?: string | null; username?: string | null; email?: string | null; image?: string | null; avatar?: string | null; profilePicture?: string | null; id: string };
  displayName: string;
};

export function DashboardHeader({ user, displayName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header className="bg-[var(--surface-container-lowest)] border-b border-[var(--outline-variant)] sticky top-0 z-20">
      <div className="mx-auto max-w-5xl px-5 h-14 flex justify-between items-center">
        <Link href="/dashboard" className="font-bold text-[15px] tracking-tight text-[var(--on-surface)]">
          Kondangan
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-xl border border-[var(--outline-variant)] hover:bg-[var(--surface-container)] transition-colors"
            >
              <Avatar user={user} size={28} />
              <span className="text-sm text-[var(--on-surface)] hidden sm:inline max-w-[120px] truncate">
                {displayName}
              </span>
              <ChevronDown size={14} className="text-[var(--on-surface-variant)]" />
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-52 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] rounded-xl shadow-lg py-1 text-sm overflow-hidden z-30">
                <div className="px-4 py-3 border-b border-[var(--outline-variant)]">
                  <p className="font-semibold text-[var(--on-surface)] truncate">{user.name || user.email}</p>
                  <p className="text-xs text-[var(--on-surface-variant)] truncate mt-0.5">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--surface-container)] text-[var(--on-surface)] transition-colors"
                >
                  <User size={15} className="text-[var(--on-surface-variant)]" /> Akun Saya
                </Link>
                <Link
                  href="/api/auth/signout"
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-500 transition-colors"
                >
                  <LogOut size={15} /> Keluar
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
