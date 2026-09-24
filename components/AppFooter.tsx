"use client";
import { getAppDownloads } from "@/lib/app-downloads";

// Footer ramping satu baris: credit + versi + link unduh.
// Sengaja kecil agar tidak mengganggu. Link yang ENV-nya kosong disembunyikan.
export function AppFooter() {
  const { version, androidUrl, windowsUrl, linuxUrl, hasVersion } =
    getAppDownloads();

  const links = [
    androidUrl ? { href: androidUrl, label: "Android" } : null,
    windowsUrl ? { href: windowsUrl, label: "Windows" } : null,
    linuxUrl ? { href: linuxUrl, label: "Linux" } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <footer className="py-4 border-t border-[var(--outline-variant)]">
      <p className="text-center text-xs text-[var(--on-surface-variant)] px-4 leading-relaxed">
        Made by Rahmad Widiansyah
        {hasVersion && <span> • v{version}</span>}
        {links.length > 0 && (
          <span>
            {" • "}
            {links.map((l, i) => (
              <span key={l.label}>
                {i > 0 && " | "}
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--on-surface)] hover:underline underline-offset-2 transition-colors"
                >
                  {l.label}
                </a>
              </span>
            ))}
          </span>
        )}
      </p>
    </footer>
  );
}
