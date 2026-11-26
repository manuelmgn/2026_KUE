-- Social profiles, privacy controls, bidirectional friendships, and internal notifications (SQLite)

ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "location" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarPath" TEXT;
ALTER TABLE "User" ADD COLUMN "festivalsVisibility" TEXT NOT NULL DEFAULT 'FRIENDS';
ALTER TABLE "User" ADD COLUMN "ratingsVisibility" TEXT NOT NULL DEFAULT 'FRIENDS';
ALTER TABLE "User" ADD COLUMN "notesVisibility" TEXT NOT NULL DEFAULT 'FRIENDS';

ALTER TABLE "UserArtistState" ADD COLUMN "ratedAt" DATETIME;

UPDATE "UserArtistState"
SET "ratedAt" = "updatedAt"
WHERE "rating" IS NOT NULL OR TRIM("notes") != '';

CREATE INDEX "UserArtistState_userId_ratedAt_idx" ON "UserArtistState"("userId", "ratedAt");
CREATE INDEX "UserEntryState_userId_updatedAt_idx" ON "UserEntryState"("userId", "updatedAt");

CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Friendship_pairKey_key" ON "Friendship"("pairKey");
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "editionId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_editionId_idx" ON "Notification"("editionId");
