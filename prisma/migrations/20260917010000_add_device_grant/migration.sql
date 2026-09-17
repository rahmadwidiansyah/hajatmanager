-- Fase 4: kode sekali-pakai untuk login Google desktop via browser.
CREATE TABLE IF NOT EXISTS "DeviceGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceGrant_codeHash_key" ON "DeviceGrant"("codeHash");
CREATE INDEX IF NOT EXISTS "DeviceGrant_userId_idx" ON "DeviceGrant"("userId");
CREATE INDEX IF NOT EXISTS "DeviceGrant_expiresAt_idx" ON "DeviceGrant"("expiresAt");

ALTER TABLE "DeviceGrant"
    ADD CONSTRAINT "DeviceGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
