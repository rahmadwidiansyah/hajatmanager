-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "kodeInput" TEXT,
ADD COLUMN     "mejaLabel" TEXT;

-- CreateIndex
CREATE INDEX "Guest_eventId_mejaLabel_idx" ON "Guest"("eventId", "mejaLabel");

-- CreateIndex
CREATE INDEX "Guest_petugasId_mejaLabel_idx" ON "Guest"("petugasId", "mejaLabel");
