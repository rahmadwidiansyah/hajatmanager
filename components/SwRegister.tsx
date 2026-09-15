"use client";

import { useEffect } from "react";

// Fase 3: daftarkan Service Worker hanya di production web.
// - Nonaktif di dev (hindari loop Fast Refresh) & di native WebView
//   (Tauri/Capacitor pakai SQLite, bukan SW).
// - Butuh secure context (HTTPS / localhost); di HTTP LAN gagal diam-diam,
//   tapi outbox Dexie tetap jalan selama halaman sudah terbuka.
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const w = window as unknown as { Capacitor?: unknown; __TAURI__?: unknown };
    if (w.Capacitor || w.__TAURI__) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
