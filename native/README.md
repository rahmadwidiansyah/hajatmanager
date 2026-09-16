# Native — Windows & Android (Offline-first)

Arsitektur hybrid sesuai plan:

- **Windows**: Tauri v2 (Rust + WebView2) → `native/windows` — target Win10/11, installer EXE NSIS sideload, size ~10-15 MB.
- **Android**: Capacitor 6 → `native/android` — target API 31+ (Android 12+), APK sideload, `minSdk 31 targetSdk 34`.
- **Shared**: Next.js build static di-load di WebView, data lokal SQLite (`tauri-plugin-sql` / `@capacitor-community/sqlite`), sync engine `lib/offline-sync.ts` + `app/api/sync/**`.
- **Offline**: login online sekali (Google/Credentials JWT 30 hari) + **PIN 6 digit** (`app/api/users/pin`) untuk buka app saat offline. Data disimpan di outbox Dexie/SQLite + read-cache. Auto-sync **1 menit** di background tanpa blokir UI (`requestIdleCallback` + `Network` listener + `visibilitychange`). Selalu coba ke server dulu saat online.
- **Semua acara online**: tidak ada lagi mode offline/online. Tombol sync di TopBar hijau = tersinkron, kuning = ada antrean, abu-abu = offline.

## Setup Windows (Tauri)

```bash
# 1. Build static export ke out/ (dari repo root)
bash scripts/build-native.sh
# 2. Build EXE
cd native/windows
npm ci
npm run tauri:build    # -> src-tauri/target/release/bundle/nsis/*.exe
```

Dev (2 terminal):

```bash
# terminal 1 — repo root
npm run dev -- --port 3000
# terminal 2
cd native/windows && npm run tauri dev   # devUrl http://localhost:3000
```

> `tauri.conf.json` (di `src-tauri/`) sengaja TANPA beforeDev/BuildCommand:
> path build web selalu dari repo root (`scripts/build-native.sh`) agar tidak
> tergantung cwd Tauri yang beda di tiap OS. CI menjalankan script itu eksplisit
> sebelum `tauri build`.

Tambah plugins:
```
npm i @tauri-apps/plugin-sql @tauri-apps/plugin-store @tauri-apps/plugin-os
# di src-tauri/Cargo.toml add tauri-plugin-sql, store, os
```

WebView2 bootstrapper otomatis untuk Win10.

## Setup Android (Capacitor)

```bash
cd native/android
npx cap init --web-dir out  # next build export
npx cap add android
npm i @capacitor-community/sqlite @capacitor/network @capacitor/preferences
npx cap sync
# buka Android Studio: npx cap open android
./gradlew assembleRelease  # -> app/build/outputs/apk/release/app-release.apk (sideload)
```

Capacitor config ada di `capacitor.config.ts`. Next.js `next.config.ts` untuk native: `output: export` saat `NATIVE_BUILD=1`.

## Shared Core

`packages/shared-core/src` berisi schema Drizzle SQLite mirror Prisma, sync engine, PIN helper (`lib/pin.ts`). Saat native siap, pindahkan `lib/offline-sync.ts` ke shared-core dan pakai SQLite adapter bukan localStorage.

Flow: `enqueueOp` (offline) → outbox lokal → `startBackgroundSync` interval 1 menit → `flushOfflineQueue` POST `/api/sync/push` saat online + `pullDelta`.
