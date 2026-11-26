-- Group festival comparisons and joint agendas (PostgreSQL)

CREATE TABLE "FestivalComparison" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FestivalComparison_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FestivalComparison_editionId_idx" ON "FestivalComparison"("editionId");
CREATE INDEX "FestivalComparison_createdById_idx" ON "FestivalComparison"("createdById");

ALTER TABLE "FestivalComparison" ADD CONSTRAINT "FestivalComparison_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "FestivalEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalComparison" ADD CONSTRAINT "FestivalComparison_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FestivalComparisonMember" (
    "comparisonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FestivalComparisonMember_pkey" PRIMARY KEY ("comparisonId", "userId")
);

CREATE INDEX "FestivalComparisonMember_userId_idx" ON "FestivalComparisonMember"("userId");

ALTER TABLE "FestivalComparisonMember" ADD CONSTRAINT "FestivalComparisonMember_comparisonId_fkey"
    FOREIGN KEY ("comparisonId") REFERENCES "FestivalComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FestivalComparisonMember" ADD CONSTRAINT "FestivalComparisonMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JointAgenda" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "comparisonId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "minRatingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 3.2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JointAgenda_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JointAgenda_editionId_idx" ON "JointAgenda"("editionId");
CREATE INDEX "JointAgenda_comparisonId_idx" ON "JointAgenda"("comparisonId");
CREATE INDEX "JointAgenda_createdById_idx" ON "JointAgenda"("createdById");

ALTER TABLE "JointAgenda" ADD CONSTRAINT "JointAgenda_editionId_fkey"
    FOREIGN KEY ("editionId") REFERENCES "FestivalEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JointAgenda" ADD CONSTRAINT "JointAgenda_comparisonId_fkey"
    FOREIGN KEY ("comparisonId") REFERENCES "FestivalComparison"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JointAgenda" ADD CONSTRAINT "JointAgenda_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JointAgendaMember" (
    "agendaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JointAgendaMember_pkey" PRIMARY KEY ("agendaId", "userId")
);

CREATE INDEX "JointAgendaMember_userId_idx" ON "JointAgendaMember"("userId");

ALTER TABLE "JointAgendaMember" ADD CONSTRAINT "JointAgendaMember_agendaId_fkey"
    FOREIGN KEY ("agendaId") REFERENCES "JointAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JointAgendaMember" ADD CONSTRAINT "JointAgendaMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JointAgendaItem" (
    "agendaId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "addedById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JointAgendaItem_pkey" PRIMARY KEY ("agendaId", "entryId")
);

CREATE INDEX "JointAgendaItem_entryId_idx" ON "JointAgendaItem"("entryId");

ALTER TABLE "JointAgendaItem" ADD CONSTRAINT "JointAgendaItem_agendaId_fkey"
    FOREIGN KEY ("agendaId") REFERENCES "JointAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JointAgendaItem" ADD CONSTRAINT "JointAgendaItem_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "FestivalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JointAgendaItem" ADD CONSTRAINT "JointAgendaItem_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
