-- Invitation links for invite-only registration (PostgreSQL)

CREATE TABLE "InvitationLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 2,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitationLink_token_key" ON "InvitationLink"("token");
CREATE INDEX "InvitationLink_createdById_idx" ON "InvitationLink"("createdById");
CREATE INDEX "InvitationLink_expiresAt_idx" ON "InvitationLink"("expiresAt");
CREATE INDEX "InvitationLink_revokedAt_idx" ON "InvitationLink"("revokedAt");

ALTER TABLE "InvitationLink" ADD CONSTRAINT "InvitationLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "invitedByLinkId" TEXT;

CREATE INDEX "User_invitedByLinkId_idx" ON "User"("invitedByLinkId");

ALTER TABLE "User" ADD CONSTRAINT "User_invitedByLinkId_fkey"
    FOREIGN KEY ("invitedByLinkId") REFERENCES "InvitationLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
