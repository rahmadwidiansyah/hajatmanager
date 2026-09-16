-- Drop offline-mode columns from Event, all events are online with local queue fallback
ALTER TABLE "Event" DROP COLUMN IF EXISTS "isOffline";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "localOnly";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "serverId";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "mode";
DROP TYPE IF EXISTS "EventMode";
