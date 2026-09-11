# shared-core — SQLite + Sync + PIN

Tempat future ekstrak `lib/offline-sync.ts`, `lib/pin.ts`, dan Drizzle schema mirror `prisma/schema.prisma` untuk native SQLite.

Saat ini `lib/offline-sync.ts` sudah pakai `localStorage` queue (web) + `flushOfflineQueue` → `/api/sync/push` dengan interval 30 menit background (`requestIdleCallback` + `Network` + `visibilitychange`) tanpa blokir UI. Saat migrasi ke SQLite: ganti adapter ke `tauri-plugin-sql` / `@capacitor-community/sqlite` dengan interface `SqliteAdapter { query, exec }`.

PIN 6 digit: `lib/pin.ts` + `app/api/users/pin` (bcrypt + `User.appPinHash`).

Event mode: `EventMode ONLINE/OFFLINE` + `isOffline/localOnly/lastSyncAt` — offline lock multi-anggota sampai `Sync ke Server`.
