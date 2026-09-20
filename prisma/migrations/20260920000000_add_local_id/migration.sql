-- Migration: tambah kolom localId di Guest dan GuestBook
--
-- localId adalah UUID yang digenerate di client (Flutter/native) saat data
-- dibuat secara offline. Dipakai sebagai kunci idempoten di server:
--   - POST /guests  → cek localId dulu sebelum insert
--   - /api/sync/push → cek localId dulu sebelum insert
-- Sehingga retry / flush ganda tidak menghasilkan baris dobel.
--
-- Nullable: data lama yang dibuat via web tidak punya localId (NULL).
-- PostgreSQL UNIQUE nullable: banyak NULL diizinkan (NULL ≠ NULL di SQL).

ALTER TABLE "Guest" ADD COLUMN "localId" TEXT;
ALTER TABLE "GuestBook" ADD COLUMN "localId" TEXT;

-- Index unique partial: hanya enforce keunikan pada baris yang punya localId
-- (non-NULL). Ini memastikan dua client berbeda tidak bisa submit localId yang
-- sama, sekaligus tidak mengganggu data lama yang localId-nya NULL.
CREATE UNIQUE INDEX "Guest_localId_key" ON "Guest"("localId") WHERE "localId" IS NOT NULL;
CREATE UNIQUE INDEX "GuestBook_localId_key" ON "GuestBook"("localId") WHERE "localId" IS NOT NULL;
