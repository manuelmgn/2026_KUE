-- Social profiles, privacy controls, bidirectional friendships, and internal notifications (PostgreSQL)

CREATE TYPE "VisibilityScope" AS ENUM ('FRIENDS', 'PRIVATE');
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TYPE "NotificationType" AS ENUM (
    'FRIEND_REQUEST_RECEIVED',
    'FRIEND_REQUEST_ACCEPTED',
    'FESTIVAL_LINEUP_UPDATED',
    'FESTIVAL_METADATA_UPDATED',
    'FRIEND_JOINED_FESTIVAL'
);

ALTER TABLE "User"
    ADD COLUMN "displayName" TEXT,
    ADD COLUMN "bio" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "location" TEXT,
    ADD COLUMN "avatarPath" TEXT,
    ADD COLUMN "festivalsVisibility" "VisibilityScope" NOT NULL DEFAULT 'FRIENDS',
    ADD COLUMN "ratingsVisibility" "VisibilityScope" NOT NULL DEFAULT 'FRIENDS',
    ADD COLUMN "notesVisibility" "VisibilityScope" NOT NULL DEFAULT 'FRIENDS';

ALTER TABLE "UserArtistState" ADD COLUMN "ratedAt" TIMESTAMP(3);

UPDATE "UserArtistState"
SET "ratedAt" = "updatedAt"
WHERE "rating" IS NOT NULL OR BTRIM("notes") <> '';

CREATE INDEX "UserArtistState_userId_ratedAt_idx" ON "UserArtistState"("userId", "ratedAt");
CREATE INDEX "UserEntryState_userId_updatedAt_idx" ON "UserEntryState"("userId", "updatedAt");

CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friendship_pairKey_key" ON "Friendship"("pairKey");
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey"
    FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorId" TEXT,
    "editionId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_editionId_idx" ON "Notification"("editionId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "FestivalEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
