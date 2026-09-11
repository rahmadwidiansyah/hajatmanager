"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-10 h-10 rounded-xl border bg-white dark:bg-zinc-800" />;
  const isDark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Ganti tema"
      title={isDark ? "Ganti ke terang" : "Ganti ke gelap"}
      className="w-10 h-10 rounded-xl border bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container)] flex items-center justify-center transition-colors"
    >
      {isDark ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-zinc-600" />}
    </button>
  );
}
