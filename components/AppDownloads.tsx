"use client";
import { Laptop, Monitor, Smartphone } from "lucide-react";
import { getAppDownloads } from "@/lib/app-downloads";

// Kartu unduhan kecil untuk halaman welcome (/).
// Render null bila semua link ENV kosong — tidak mengganggu layout.
export function AppDownloads() {
  const { version, androidUrl, windowsUrl, linuxUrl, hasAny, hasVersion } =
    getAppDownloads();
  if (!hasAny && !hasVersion) return null;

  const items = [
    androidUrl
      ? {
          href: androidUrl,
          label: "Android",
          sub: "APK",
          icon: <Smartphone size={16} />,
        }
      : null,
    windowsUrl
      ? {
          href: windowsUrl,
          label: "Windows",
          sub: "Setup.exe",
          icon: <Monitor size={16} />,
        }
      : null,
    linuxUrl
      ? {
          href: linuxUrl,
          label: "Linux",
          sub: "AppImage",
          icon: <Laptop size={16} />,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (items.length === 0 && !hasVersion) return null;

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-[var(--shadow-elevation-1)]">
      <div className="flex items-center justify-center gap-2">
        <p className="text-sm font-semibold text-[var(--on-surface)]">
          Unduh Aplikasi
        </p>
        {hasVersion && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-container)] text-[var(--on-surface-variant)] border border-[var(--outline-variant)]">
            v{version}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface)] hover:bg-[var(--surface-container)] transition-colors flex items-center gap-2"
            >
              {it.icon}
              <span>
                {it.label}
                <span className="ml-1 text-xs text-[var(--on-surface-variant)]">
                  {it.sub}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
