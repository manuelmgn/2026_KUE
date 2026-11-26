-- Multi-user identity, sessions, per-user personal states, and Festival -> FestivalEdition hierarchy (PostgreSQL)

-- 1. CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- 2. Create identity & configuration tables
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "LegacyPersonalItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" INTEGER,
    "status" "ArtistStatus",
    "notes" TEXT NOT NULL DEFAULT '',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT,
    CONSTRAINT "LegacyPersonalItem_pkey" PRIMARY KEY ("id")
);

-- 3. Snapshot existing personal ratings, statuses, notes, album pins, and live ratings before dropping columns
INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_artist_' || "id", 'ARTIST', "id", "rating", "status", "notes", false, NULL
FROM "Artist"
WHERE "rating" IS NOT NULL OR "status" <> 'PENDING' OR "notes" <> '';

INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_album_' || "id", 'ALBUM', "id", NULL, NULL, '', "isPinned", "customUrl"
FROM "Album"
WHERE "isPinned" = true OR "customUrl" IS NOT NULL;

INSERT INTO "LegacyPersonalItem" ("id", "kind", "targetId", "rating", "status", "notes", "isPinned", "customUrl")
SELECT 'legacy_entry_' || "id", 'ENTRY', "id", "liveRating", NULL, "liveNotes", false, NULL
FROM "FestivalEntry"
WHERE "liveRating" IS NOT NULL OR "liveNotes" <> '';

-- 4. Split Festival into parent Festival (brand) + FestivalEdition (annual edition)
ALTER TABLE "FestivalEntry" DROP CONSTRAINT "FestivalEntry_festivalId_fkey";
DROP INDEX IF EXISTS "Festival_slug_key";
DROP INDEX IF EXISTS "Festival_year_idx";
DROP INDEX IF EXISTS "Festival_autoSyncEnabled_idx";
ALTER TABLE "Festival" RENAME CONSTRAINT "Festival_pkey" TO "_OldFestival_pkey";
ALTER TABLE "Festival" RENAME TO "_OldFestival";

CREATE TABLE "Festival" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "location" TEXT,
    "locationProvince" TEXT,
    "locationRegion" TEXT,
    "locationCountry" TEXT,
    "locationCountryCode" TEXT,
    "locationLatitude" DOUBLE PRECISION,
    "locationLongitude" DOUBLE PRECISION,
    "locationPlaceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Festival_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Festival" (
    "id", "slug", "name", "normalizedName",
    "location", "locationProvince", "locationRegion", "locationCountry",
    "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId",
    "createdAt", "updatedAt"
)
SELECT DISTINCT ON (LOWER(TRIM("name")))
    'brand_' || "id",
    LOWER(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING("id" FROM 1 FOR 6),
    TRIM("name"),
    LOWER(TRIM("name")),
    "location", "locationProvince", "locationRegion", "locationCountry",
    "locationCountryCode", "locationLatitude", "locationLongitude", "locationPlaceId",
    "createdAt", "updatedAt"
FROM "_OldFestival"
ORDER BY LOWER(TRIM("name")), "year" DESC, "createdAt" ASC;

CREATE TABLE "FestivalEdition" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "location" TEXT,
    "locationProvince" TEXT,
    "locationRegion" TEXT,
    "locationCountry" TEXT,
    "locationCountryCode" TEXT,
    "locationLatitude" DOUBLE PRECISION,
    "locationLongitude" DOUBLE PRECISION,
    "locationPlaceId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "lineupSourceUrl" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncMode" "LineupSyncMode" NOT NULL DEFAULT 'REVIEW',
    "syncIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastLineupSyncAt" TIMESTAMP(3),
    "lastLineupContentHash" TEXT,
    "lastLineupSyncError" TEXT,
    "pendingLineupDiff" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalEdition_pkey" PRIMARY KEY ("id")
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

-- 5. Update FestivalEntry, Artist, and Album
DROP INDEX IF EXISTS "FestivalEntry_festivalId_day_idx";
DROP INDEX IF EXISTS "FestivalEntry_festivalId_sortOrder_idx";
ALTER TABLE "FestivalEntry" RENAME COLUMN "festivalId" TO "editionId";
ALTER TABLE "FestivalEntry" DROP COLUMN "liveRating", DROP COLUMN "liveNotes";

DROP INDEX IF EXISTS "Artist_status_idx";
DROP INDEX IF EXISTS "Artist_rating_idx";
ALTER TABLE "Artist" DROP COLUMN "rating", DROP COLUMN "status", DROP COLUMN "notes";

DROP INDEX IF EXISTS "Album_artistId_isPinned_idx";
ALTER TABLE "Album" DROP COLUMN "isPinned", DROP COLUMN "customUrl";

-- 6. Create per-user personal tables
CREATE TABLE "UserFestivalEdition" (
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFestivalEdition_pkey" PRIMARY KEY ("userId", "editionId")
);

CREATE TABLE "UserArtistState" (
    "userId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "rating" INTEGER,
    "status" "ArtistStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserArtistState_pkey" PRIMARY KEY ("userId", "artistId")
);

CREATE TABLE "UserAlbumState" (
    "userId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAlbumState_pkey" PRIMARY KEY ("userId", "albumId")
);

CREATE TABLE "UserEntryState" (
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "liveRating" INTEGER,
    "liveNotes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserEntryState_pkey" PRIMARY KEY ("userId", "entryId")
);

-- 7. Indexes
CREATE UNIQUE INDEX "User_normalizedUsername_key" ON "User"("normalizedUsername");
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE INDEX "LegacyPersonalItem_kind_idx" ON "LegacyPersonalItem"("kind");
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

-- 8. Foreign keys
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Festival" ADD CONSTRAINT "Festival_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FestivalEdition" ADD CONSTRAINT "FestivalEdition_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalEdition" ADD CONSTRAINT "FestivalEdition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserFestivalEdition" ADD CONSTRAINT "UserFestivalEdition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFestivalEdition" ADD CONSTRAINT "UserFestivalEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalEntry" ADD CONSTRAINT "FestivalEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserArtistState" ADD CONSTRAINT "UserArtistState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserArtistState" ADD CONSTRAINT "UserArtistState_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAlbumState" ADD CONSTRAINT "UserAlbumState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAlbumState" ADD CONSTRAINT "UserAlbumState_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEntryState" ADD CONSTRAINT "UserEntryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserEntryState" ADD CONSTRAINT "UserEntryState_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FestivalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
