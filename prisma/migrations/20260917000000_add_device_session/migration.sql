-- Fase 3: token perangkat untuk client native (WPF/Flutter).
-- Token mentah hanya diperlihatkan sekali saat diterbitkan; yang disimpan sha256 hex.
CREATE TABLE IF NOT EXISTS "DeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSession_tokenHash_key" ON "DeviceSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "DeviceSession_userId_idx" ON "DeviceSession"("userId");
CREATE INDEX IF NOT EXISTS "DeviceSession_expiresAt_idx" ON "DeviceSession"("expiresAt");

ALTER TABLE "DeviceSession"
    ADD CONSTRAINT "DeviceSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
