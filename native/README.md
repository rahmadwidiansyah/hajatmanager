# Native — Windows & Android (Offline-first)

Arsitektur hybrid sesuai plan:

- **Windows**: Tauri v2 (Rust + WebView2) → `native/windows` — target Win10/11, installer EXE NSIS sideload, size ~10-15 MB.
- **Android**: Capacitor 6 → `native/android` — target API 31+ (Android 12+), APK sideload, `minSdk 31 targetSdk 34`.
- **Shared**: Next.js build static di-load di WebView, data lokal SQLite (`tauri-plugin-sql` / `@capacitor-community/sqlite`), sync engine `lib/offline-sync.ts` + `app/api/sync/**`.
- **Offline**: login online sekali (Google/Credentials JWT 30 hari) + **PIN 6 digit** (`app/api/users/pin`) untuk buka app saat offline. Data disimpan di `localStorage offlineQueue:${eventId}` (web) atau SQLite (native). Auto-sync **30 menit** di background tanpa blokir UI (`requestIdleCallback` + `Network` listener + `visibilitychange`).
- **Event Offline**: `Event.mode` ONLINE/OFFLINE (`prisma/schema.prisma`). Offline → `isOffline=true`, multi-anggota disabled (`app/api/events/[id]/members` 403 + UI banner). Tombol **Sync ke Server** → `POST /api/sync/push` + `PATCH /api/events/[id]` `mode:ONLINE` → unlock.

## Setup Windows (Tauri)

```bash
cd native/windows
npm create tauri@latest . -- --manager npm
npm i
# tauri.conf.json sudah placeholder, update `build.beforeBuildCommand` ke `npm run build` di root
npm run tauri dev      # dev dengan Next.js di http://localhost:3000
npm run tauri build    # -> src-tauri/target/release/bundle/nsis/*.exe
```

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

Flow: `enqueueGuest` (offline) → local queue → `startBackgroundSync` interval 30 menit → `flushOfflineQueue` POST `/api/sync/push` saat online.
