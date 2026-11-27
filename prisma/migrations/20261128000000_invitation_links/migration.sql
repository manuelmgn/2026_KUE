-- Invitation links for invite-only registration (SQLite)

CREATE TABLE "InvitationLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "createdById" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 2,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InvitationLink_token_key" ON "InvitationLink"("token");
CREATE INDEX "InvitationLink_createdById_idx" ON "InvitationLink"("createdById");
CREATE INDEX "InvitationLink_expiresAt_idx" ON "InvitationLink"("expiresAt");
CREATE INDEX "InvitationLink_revokedAt_idx" ON "InvitationLink"("revokedAt");

ALTER TABLE "User" ADD COLUMN "invitedByLinkId" TEXT REFERENCES "InvitationLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_invitedByLinkId_idx" ON "User"("invitedByLinkId");
