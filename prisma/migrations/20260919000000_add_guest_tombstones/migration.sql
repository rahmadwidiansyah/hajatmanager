ALTER TABLE "GuestBook" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Guest" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "GuestBook_eventId_deletedAt_idx" ON "GuestBook"("eventId", "deletedAt");
CREATE INDEX "Guest_eventId_deletedAt_idx" ON "Guest"("eventId", "deletedAt");
