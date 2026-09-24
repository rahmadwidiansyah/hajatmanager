import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Web only — full Flutter untuk mobile (Capacitor/Tauri dihapus).

// Revisi untuk precache fallback statis + /unlock — ikut commit git, fallback statis bila git tak ada.
let offlineRevision = "v1";
try {
  const out = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim();
  if (out) offlineRevision = out;
} catch {}

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Matikan di dev (hindari loop Fast Refresh).
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  exclude: [/\.webmanifest$/],
  additionalPrecacheEntries: [
    // Fase 6: offline.html statis (public/) — deterministic, tanpa hidrasi Next.
    { url: "/offline.html", revision: offlineRevision },
    { url: "/unlock", revision: offlineRevision },
  ],
});

// Catatan build: `next build` production memakai `--webpack` (lihat package.json)
// karena @serwist/next menyuntik konfigurasi webpack yang tidak didukung
// Turbopack (default Next 16). Dev memakai Turbopack tanpa wrapper Serwist
// (SW nonaktif di dev, lihat export di bawah).

// Versi semantic-release = package.json (diupdate otomatis oleh
// semantic-release tiap tag v*). Jadikan default NEXT_PUBLIC_APP_VERSION
// agar tampilan web + link unduhan selalu ngikutin versi rilis tanpa
// edit .env manual. ENV eksplisit tetap menang bila diisi.
let pkgVersion = "";
try {
  pkgVersion =
    (JSON.parse(readFileSync("./package.json", "utf-8")).version ?? "").trim();
} catch {}

const nextConfig: NextConfig = {
  // HP Android akses via IP LAN saat dev (HMR + API).
  allowedDevOrigins: ["192.168.1.85"],
  // Web only — mobile full Flutter (native WebView dihapus).
  output: "standalone" as const,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION?.trim() || pkgVersion,
  },
  // Mitigasi bundle MUI: import per-komponen agar tree-shake optimal
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
    "@mui/icons-material": {
      transform: "@mui/icons-material/{{member}}",
    },
  },
};

export default (() => {
  // Dev (Turbopack): SW nonaktif, jadi jangan bungkus withSerwist
  // agar tidak menyuntik config `webpack` yang ditolak Turbopack Next 16.
  // withSerwist hanya dipakai saat `next build` web production.
  if (process.env.NODE_ENV === "development") return nextConfig;
  return withSerwist(nextConfig);
})();
