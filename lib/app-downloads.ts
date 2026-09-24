// Sumber tunggal untuk versi + link unduhan aplikasi (Web).
//
// Prioritas tiap nilai:
//   1. ENV eksplisit (override manual)
//   2. Otomatis dari versi semantic-release + repo GitHub:
//      https://github.com/<owner>/<repo>/releases/download/v<ver>/<file>
//   3. Kosong = tombol/badge disembunyikan oleh komponen.
//
// Nama file mengikuti `.github/workflows/release-assets.yml` dan sudah
// diverifikasi terhadap aset rilis v1.13.1:
//   - Hajat-Manager-<ver>.apk (signed; bila tanpa keystore jadi -unsigned.apk)
//   - Hajat-Manager-<ver>-windows-x64-Setup.exe
//   - Hajat-Manager-<ver>-linux-x64.tar.gz

export const DEFAULT_GITHUB_REPO = "rahmadwidiansyah/hajatmanager";

export type AppDownloads = {
  version: string;
  githubRepo: string;
  releaseTag: string;
  releaseUrl: string;
  androidUrl: string;
  windowsUrl: string;
  linuxUrl: string;
  hasAny: boolean;
  hasVersion: boolean;
};

function clean(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

function apkFile(version: string): string {
  const unsigned =
    clean(process.env.NEXT_PUBLIC_APK_UNSIGNED).toLowerCase() === "true";
  return unsigned
    ? `Hajat-Manager-${version}-unsigned.apk`
    : `Hajat-Manager-${version}.apk`;
}

export function getAppDownloads(): AppDownloads {
  // next.config.ts sudah fallback ke package.json bila ENV kosong,
  // jadi di sini versi = versi semantic-release saat build.
  const version = clean(process.env.NEXT_PUBLIC_APP_VERSION).replace(/^v/i, "");
  const githubRepo =
    clean(process.env.NEXT_PUBLIC_GITHUB_REPO) || DEFAULT_GITHUB_REPO;
  const releaseTag = version ? `v${version}` : "";
  const releaseUrl = version
    ? `https://github.com/${githubRepo}/releases/tag/${releaseTag}`
    : "";

  const auto = (file: string) =>
    version
      ? `https://github.com/${githubRepo}/releases/download/${releaseTag}/${file}`
      : "";

  const androidUrl =
    clean(process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID) || auto(apkFile(version));
  const windowsUrl =
    clean(process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS) ||
    auto(`Hajat-Manager-${version}-windows-x64-Setup.exe`);
  const linuxUrl =
    clean(process.env.NEXT_PUBLIC_DOWNLOAD_LINUX) ||
    auto(`Hajat-Manager-${version}-linux-x64.tar.gz`);

  return {
    version,
    githubRepo,
    releaseTag,
    releaseUrl,
    androidUrl,
    windowsUrl,
    linuxUrl,
    hasAny: Boolean(androidUrl || windowsUrl || linuxUrl),
    hasVersion: Boolean(version),
  };
}
