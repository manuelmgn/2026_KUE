-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "mbid" TEXT,
    "deezerId" TEXT,
    "country" TEXT,
    "bio" TEXT,
    "imagePath" TEXT,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artistId" TEXT NOT NULL,
    "mbid" TEXT,
    "title" TEXT NOT NULL,
    "releaseYear" INTEGER,
    "releaseType" TEXT NOT NULL DEFAULT 'ALBUM',
    "coverPath" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Album_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Festival" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "location" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FestivalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "festivalId" TEXT NOT NULL,
    "billingName" TEXT NOT NULL,
    "subtitle" TEXT,
    "day" TEXT,
    "stage" TEXT,
    "setTime" TEXT,
    "liveRating" INTEGER,
    "liveNotes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FestivalEntry_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FestivalEntryArtist" (
    "entryId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("entryId", "artistId"),
    CONSTRAINT "FestivalEntryArtist_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FestivalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FestivalEntryArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_normalizedName_key" ON "Artist"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_mbid_key" ON "Artist"("mbid");

-- CreateIndex
CREATE INDEX "Artist_status_idx" ON "Artist"("status");

-- CreateIndex
CREATE INDEX "Artist_rating_idx" ON "Artist"("rating");

-- CreateIndex
CREATE INDEX "Artist_syncStatus_idx" ON "Artist"("syncStatus");

-- CreateIndex
CREATE INDEX "Album_artistId_isPinned_idx" ON "Album"("artistId", "isPinned");

-- CreateIndex
CREATE UNIQUE INDEX "Album_artistId_mbid_key" ON "Album"("artistId", "mbid");

-- CreateIndex
CREATE UNIQUE INDEX "Festival_slug_key" ON "Festival"("slug");

-- CreateIndex
CREATE INDEX "Festival_year_idx" ON "Festival"("year");

-- CreateIndex
CREATE INDEX "FestivalEntry_festivalId_day_idx" ON "FestivalEntry"("festivalId", "day");

-- CreateIndex
CREATE INDEX "FestivalEntry_festivalId_sortOrder_idx" ON "FestivalEntry"("festivalId", "sortOrder");

-- CreateIndex
CREATE INDEX "FestivalEntryArtist_artistId_idx" ON "FestivalEntryArtist"("artistId");
