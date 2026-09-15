import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import "./globals.css";
import { MuiProvider } from "@/components/MuiProvider";
import { SwRegister } from "@/components/SwRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hajat Manager - Manajemen Tamu Hajatan",
  description: "Aplikasi Hajat Manager: buku tamu, catat pemberian satset, multi-admin tak terbatas, rekap & export.",
  // Fase 3: PWA — manifest digenerate dari app/manifest.ts
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hajat Manager",
    statusBarStyle: "default",
  },
  // Ikon tab browser via konvensi file: app/favicon.ico, app/icon.png, app/apple-icon.png
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      {/* Init tema harus di dalam <body> (punya urutan dokumen) —
          jangan jadi anak langsung <html>, Next 16 menolak script sync di luar head/body.
          Tetap jalan sebelum paint karena ini inline script pertama di body. */}
      <body className="min-h-dvh flex flex-col bg-[var(--background)] text-[var(--on-surface)]">
        <InitColorSchemeScript />
        <SwRegister />
        <MuiProvider>{children}</MuiProvider>
      </body>
    </html>
  );
}
