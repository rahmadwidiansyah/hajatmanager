"use client";
import { Moon, Sun } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  // mode undefined saat SSR — tampilkan skeleton agar tak flash
  if (!mode)
    return (
      <div
        aria-hidden
        className="w-10 h-10 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]"
      />
    );
  const resolved = mode === "system" ? systemMode : mode;
  const isDark = resolved === "dark";
  return (
    <button
      onClick={() => setMode(isDark ? "light" : "dark")}
      aria-label="Ganti tema"
      title={isDark ? "Ganti ke terang" : "Ganti ke gelap"}
      className="w-10 h-10 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container)] flex items-center justify-center transition-colors"
    >
      {isDark ? (
        <Sun size={18} className="text-[var(--warning)]" />
      ) : (
        <Moon size={18} className="text-[var(--on-surface-variant)]" />
      )}
    </button>
  );
}
