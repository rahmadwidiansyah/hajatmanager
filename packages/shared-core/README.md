# shared-core — SQLite + Sync + PIN

Tempat future ekstrak `lib/offline-sync.ts`, `lib/pin.ts`, dan Drizzle schema mirror `prisma/schema.prisma` untuk native SQLite.

Saat ini `lib/offline-sync.ts` sudah pakai `localStorage` queue (web) + `flushOfflineQueue` → `/api/sync/push` dengan background sync (`requestIdleCallback` + `visibilitychange`) tanpa blokir UI.

PIN 6 digit: `lib/pin.ts` + `app/api/users/pin` (bcrypt + `User.appPinHash`).

Semua acara online dengan antrean lokal: `Event.lastSyncAt` + outbox Dexie/SQLite. Tidak ada lagi mode offline/online, multi-anggota selalu aktif saat online.
