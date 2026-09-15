import type { MetadataRoute } from "next";

// Wajib force-static agar lolos `output: export` saat NATIVE_BUILD (Tauri).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hajat Manager - Manajemen Tamu Hajatan",
    short_name: "Hajat",
    description:
      "Aplikasi Hajat Manager: buku tamu, catat pemberian satset, multi-admin tak terbatas, rekap & export. Bisa dipakai offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#059669",
    lang: "id",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
