-- Multi-user identity, sessions, per-user personal states, and Festival -> FestivalEdition hierarchy
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1. Create identity & configuration tables
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LegacyPersonalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" INTEGER,
    "status" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT
);

-- 2. Snapshot existing personal ratings, statuses, notes, album pins, and live ratings before removing columns
INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_artist_' || "id", 'ARTIST', "id", "rating", "status", "notes", false, NULL
FROM "Artist"
WHERE "rating" IS NOT NULL OR "status" != 'PENDING' OR "notes" != '';

INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_album_' || "id", 'ALBUM', "id", NULL, NULL, '', "isPinned", "customUrl"
FROM "Album"
WHERE "isPinned" = true OR "customUrl" IS NOT NULL;

INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_entry_' || "id", 'ENTRY', "id", "liveRating", NULL, "liveNotes", false, NULL
FROM "FestivalEntry"
WHERE "liveRating" IS NOT NULL OR "liveNotes" != '';

-- 3. Split existing Festival rows into parent Festival (brand) + FestivalEdition (annual edition)
ALTER TABLE "Festival" RENAME TO "_OldFestival";

CREATE TABLE "Festival" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "location" TEXT,
    "locationProvince" TEXT,
    "locationRegion" TEXT,
    "locationCountry" TEXT,
    "locationCountryCode" TEXT,
    "locationLatitude" REAL,
    "locationLongitude" REAL,
    "locationPlaceId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Festival_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Festival" (
    "id", "slug", "name", "normalizedName",
    "location", "locationProvince", "locationRegion", "locationCountry",
    "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId",
    "createdAt", "updatedAt"
)
SELECT
    'brand_' || MIN("id"),
    LOWER(REPLACE(TRIM("name"), ' ', '-')) || '-' || SUBSTR(MIN("id"), 1, 6),
    TRIM("name"),
    LOWER(TRIM("name")),
    "location", "locationProvince", "locationRegion", "locationCountry",
    "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId",
    MIN("createdAt"), MAX("updatedAt")
FROM "_OldFestival"
GROUP BY LOWER(TRIM("name"));

CREATE TABLE "FestivalEdition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "festivalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FestivalEdition_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FestivalEdition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "FestivalEdition" (
    "id", "festivalId", "slug", "year",
    "location", "locationProvince", "locationRegion", "locationCountry",
    "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId",
    "startDate", "endDate",
    "lineupSourceUrl", "autoSyncEnabled", "autoSyncMode", "syncIntervalHours",
    "lastLineupSyncAt", "lastLineupContentHash", "lastLineupSyncError", "pendingLineupDiff",
    "createdAt", "updatedAt"
)
SELECT
    o."id", f."id", o."slug", o."year",
    o."location", o."locationProvince", o."locationRegion", o."locationCountry",
    o."locationCountryCode", o."locationLatitude", o."locationLongitude", o."locationPlaceId",
    o."startDate", o."endDate",
    o."lineupSourceUrl", o."autoSyncEnabled", o."autoSyncMode", o."syncIntervalHours",
    o."lastLineupSyncAt", o."lastLineupContentHash", o."lastLineupSyncError", o."pendingLineupDiff",
    o."createdAt", o."updatedAt"
FROM "_OldFestival" o
JOIN "Festival" f ON f."normalizedName" = LOWER(TRIM(o."name"));

DROP TABLE "_OldFestival";

-- 4. Rebuild Artist without per-user columns
CREATE TABLE "new_Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "mbid" TEXT,
    "deezerId" TEXT,
    "country" TEXT,
    "bio" TEXT,
    "imagePath" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Artist" (
    "id", "name", "normalizedName", "mbid", "deezerId", "country", "bio", "imagePath",
    "syncStatus", "syncError", "syncedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "name", "normalizedName", "mbid", "deezerId", "country", "bio", "imagePath",
    "syncStatus", "syncError", "syncedAt", "createdAt", "updatedAt"
FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";

-- 5. Rebuild Album without per-user columns
CREATE TABLE "new_Album" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artistId" TEXT NOT NULL,
    "mbid" TEXT,
    "title" TEXT NOT NULL,
    "releaseYear" INTEGER,
    "releaseType" TEXT NOT NULL DEFAULT 'ALBUM',
    "coverPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Album_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Album" (
    "id", "artistId", "mbid", "title", "releaseYear", "releaseType", "coverPath", "createdAt", "updatedAt"
)
SELECT
    "id", "artistId", "mbid", "title", "releaseYear", "releaseType", "coverPath", "createdAt", "updatedAt"
FROM "Album";
DROP TABLE "Album";
ALTER TABLE "new_Album" RENAME TO "Album";

-- 6. Rebuild FestivalEntry pointing to FestivalEdition without per-user columns
CREATE TABLE "new_FestivalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "billingName" TEXT NOT NULL,
    "subtitle" TEXT,
    "day" TEXT,
    "stage" TEXT,
    "setTime" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FestivalEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FestivalEntry" (
    "id", "editionId", "billingName", "subtitle", "day", "stage", "setTime", "sortOrder", "createdAt", "updatedAt"
)
SELECT
    "id", "festivalId", "billingName", "subtitle", "day", "stage", "setTime", "sortOrder", "createdAt", "updatedAt"
FROM "FestivalEntry";
DROP TABLE "FestivalEntry";
ALTER TABLE "new_FestivalEntry" RENAME TO "FestivalEntry";

-- 7. Create per-user personal tables
CREATE TABLE "UserFestivalEdition" (
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "editionId"),
    CONSTRAINT "UserFestivalEdition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserFestivalEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserArtistState" (
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "artistId"),
    CONSTRAINT "UserArtistState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserArtistState_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserAlbumState" (
    "userId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "albumId"),
    CONSTRAINT "UserAlbumState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAlbumState_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserEntryState" (
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "liveRating" INTEGER,
    "liveNotes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "entryId"),
    CONSTRAINT "UserEntryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserEntryState_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FestivalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8. Indexes
CREATE UNIQUE INDEX "User_normalizedUsername_key" ON "User"("normalizedUsername");
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE INDEX "LegacyPersonalItem_kind_idx" ON "LegacyPersonalItem"("kind");

CREATE UNIQUE INDEX "Artist_normalizedName_key" ON "Artist"("normalizedName");
CREATE UNIQUE INDEX "Artist_mbid_key" ON "Artist"("mbid");
CREATE INDEX "Artist_syncStatus_idx" ON "Artist"("syncStatus");

CREATE UNIQUE INDEX "Album_artistId_mbid_key" ON "Album"("artistId", "mbid");
CREATE INDEX "Album_artistId_idx" ON "Album"("artistId");

CREATE UNIQUE INDEX "Festival_slug_key" ON "Festival"("slug");
CREATE UNIQUE INDEX "Festival_normalizedName_key" ON "Festival"("normalizedName");
CREATE INDEX "Festival_name_idx" ON "Festival"("name");

CREATE UNIQUE INDEX "FestivalEdition_slug_key" ON "FestivalEdition"("slug");
CREATE UNIQUE INDEX "FestivalEdition_festivalId_year_key" ON "FestivalEdition"("festivalId", "year");
CREATE INDEX "FestivalEdition_year_idx" ON "FestivalEdition"("year");
CREATE INDEX "FestivalEdition_festivalId_idx" ON "FestivalEdition"("festivalId");

CREATE INDEX "UserFestivalEdition_editionId_idx" ON "UserFestivalEdition"("editionId");
CREATE INDEX "UserFestivalEdition_userId_addedAt_idx" ON "UserFestivalEdition"("userId", "addedAt");

CREATE INDEX "FestivalEntry_editionId_day_idx" ON "FestivalEntry"("editionId", "day");
CREATE INDEX "FestivalEntry_editionId_sortOrder_idx" ON "FestivalEntry"("editionId", "sortOrder");

CREATE INDEX "UserArtistState_userId_status_idx" ON "UserArtistState"("userId", "status");
CREATE INDEX "UserArtistState_userId_rating_idx" ON "UserArtistState"("userId", "rating");
CREATE INDEX "UserAlbumState_userId_isPinned_idx" ON "UserAlbumState"("userId", "isPinned");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
