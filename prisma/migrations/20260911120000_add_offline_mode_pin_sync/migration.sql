-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "localOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "EventMode" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "serverId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appPinHash" TEXT,
ADD COLUMN     "pinCreatedAt" TIMESTAMP(3);
