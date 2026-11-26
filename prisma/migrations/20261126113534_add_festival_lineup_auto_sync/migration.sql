-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Festival" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "location" TEXT,
    "locationProvince" TEXT,
    "locationRegion" TEXT,
    "locationCountry" TEXT,
    "locationCountryCode" TEXT,
    "locationLatitude" REAL,
    "locationLongitude" REAL,
    "locationPlaceId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "lineupSourceUrl" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncMode" TEXT NOT NULL DEFAULT 'REVIEW',
    "syncIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastLineupSyncAt" DATETIME,
    "lastLineupContentHash" TEXT,
    "lastLineupSyncError" TEXT,
    "pendingLineupDiff" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Festival" ("createdAt", "endDate", "id", "location", "locationCountry", "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId", "locationProvince", "locationRegion", "name", "slug", "startDate", "updatedAt", "year") SELECT "createdAt", "endDate", "id", "location", "locationCountry", "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId", "locationProvince", "locationRegion", "name", "slug", "startDate", "updatedAt", "year" FROM "Festival";
DROP TABLE "Festival";
ALTER TABLE "new_Festival" RENAME TO "Festival";
CREATE UNIQUE INDEX "Festival_slug_key" ON "Festival"("slug");
CREATE INDEX "Festival_year_idx" ON "Festival"("year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
