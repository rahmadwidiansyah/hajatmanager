"use client";

import { useEffect } from "react";

// Fase 3: daftarkan Service Worker hanya di production web.
// - Nonaktif di dev (hindari loop Fast Refresh).
// - Butuh secure context (HTTPS / localhost); di HTTP LAN gagal diam-diam,
//   tapi outbox Dexie tetap jalan selama halaman sudah terbuka.
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
