"use client";

import { useEffect } from "react";

// Web 100% Online-Only: unregister seluruh Service Worker & hapus CacheStorage
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Unregister Service Workers yang pernah terpasang
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      }).catch(() => {});
    }

    // 2. Bersihkan CacheStorage di browser
    if ("caches" in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name).catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  return null;
}
