# Android — Capacitor (API 31+, Android 12+)

- **minSdk 31, targetSdk 34** (Android 12 sideload APK, no Play Store)
- **SQLite**: `@capacitor-community/sqlite` + `jeep-sqlite` web fallback, encrypted (`androidIsEncryption: true`)
- **Background sync**: `lib/offline-sync.ts` interval **30 menit** + `Network.addListener('networkStatusChange')` + `visibilitychange` — non-blocking (`requestIdleCallback`)
- **PIN 6 digit**: stored via `Preferences` (fallback) or native Keystore if available

## Dev

```bash
cd native/android
npm install
npm run cap:sync
npx cap open android   # Android Studio
# atau build sideload:
npm run cap:build      # -> android/app/build/outputs/apk/release/app-release.apk
```

Next.js `out/` harus ada: di root `NATIVE_BUILD=1 npm run build` (atau `npm run build` di native/windows akan trigger yang sama).
Untuk emulator dev: set `server.url: "http://10.0.2.2:3000"` di capacitor.config.ts dan `npm run dev` di root.
