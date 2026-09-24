import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Web 100% Online-Only — tanpa Service Worker & tanpa browser cache.

let pkgVersion = "";
try {
  pkgVersion =
    (JSON.parse(readFileSync("./package.json", "utf-8")).version ?? "").trim();
} catch {}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.85"],
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
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
    "@mui/icons-material": {
      transform: "@mui/icons-material/{{member}}",
    },
  },
  // Dipaksa 100% online & tanpa browser cache (no-store, no-cache, must-revalidate)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
