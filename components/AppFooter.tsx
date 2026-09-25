"use client";
import { Download, Laptop, Monitor, Smartphone } from "lucide-react";
import { getAppDownloads } from "@/lib/app-downloads";

// Footer ramping: credit + versi + tombol unduh berikon.
// Link yang ENV-nya kosong disembunyikan. Varian lain (Setup C#,
// tarball Linux) tetap ada di halaman rilis GitHub.
export function AppFooter() {
  const { version, androidUrl, windowsUrl, linuxUrl, releaseUrl, hasVersion } =
    getAppDownloads();

  const links = [
    androidUrl
      ? { href: androidUrl, label: "Android", sub: "APK", icon: <Smartphone size={13} /> }
      : null,
    windowsUrl
      ? { href: windowsUrl, label: "Windows", sub: "Setup.exe", icon: <Monitor size={13} /> }
      : null,
    linuxUrl
      ? { href: linuxUrl, label: "Linux", sub: "AppImage", icon: <Laptop size={13} /> }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <footer className="py-4 border-t border-[var(--outline-variant)]">
      <p className="text-center text-xs text-[var(--on-surface-variant)] px-4 leading-relaxed">
        Made by Rahmad Widiansyah
        {hasVersion && <span> • v{version}</span>}
      </p>
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-4">
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--on-surface-variant)]">
            <Download size={13} />
            Unduh:
          </span>
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded-full border border-[var(--outline-variant)] text-xs text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors flex items-center gap-1.5"
            >
              {l.icon}
              <span className="font-medium">{l.label}</span>
              <span className="text-[var(--on-surface-variant)]">{l.sub}</span>
            </a>
          ))}
          {releaseUrl && (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] hover:underline underline-offset-2 transition-colors"
            >
              Semua versi →
            </a>
          )}
        </div>
      )}
    </footer>
  );
}
