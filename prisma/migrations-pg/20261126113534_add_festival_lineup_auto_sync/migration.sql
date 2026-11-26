-- CreateEnum
CREATE TYPE "LineupSyncMode" AS ENUM ('REVIEW', 'AUTO');

-- AlterTable
ALTER TABLE "Festival" ADD COLUMN "lineupSourceUrl" TEXT,
ADD COLUMN "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoSyncMode" "LineupSyncMode" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN "syncIntervalHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "lastLineupSyncAt" TIMESTAMP(3),
ADD COLUMN "lastLineupContentHash" TEXT,
ADD COLUMN "lastLineupSyncError" TEXT,
ADD COLUMN "pendingLineupDiff" TEXT;
