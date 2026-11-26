-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ArtistStatus" AS ENUM ('PENDING', 'LISTENING', 'RATED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('ALBUM', 'EP', 'LIVE', 'OTHER');

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "mbid" TEXT,
    "deezerId" TEXT,
    "country" TEXT,
    "bio" TEXT,
    "imagePath" TEXT,
    "rating" INTEGER,
    "status" "ArtistStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "mbid" TEXT,
    "title" TEXT NOT NULL,
    "releaseYear" INTEGER,
    "releaseType" "ReleaseType" NOT NULL DEFAULT 'ALBUM',
    "coverPath" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "customUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Festival" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Festival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalEntry" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "billingName" TEXT NOT NULL,
    "subtitle" TEXT,
    "day" TEXT,
    "stage" TEXT,
    "setTime" TEXT,
    "liveRating" INTEGER,
    "liveNotes" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FestivalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalEntryArtist" (
    "entryId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FestivalEntryArtist_pkey" PRIMARY KEY ("entryId","artistId")
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

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalEntry" ADD CONSTRAINT "FestivalEntry_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "Festival"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalEntryArtist" ADD CONSTRAINT "FestivalEntryArtist_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FestivalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalEntryArtist" ADD CONSTRAINT "FestivalEntryArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

