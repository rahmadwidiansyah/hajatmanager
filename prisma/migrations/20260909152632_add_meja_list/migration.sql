-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "mejaList" TEXT[] DEFAULT ARRAY['MEJA-1', 'MEJA-2']::TEXT[];
