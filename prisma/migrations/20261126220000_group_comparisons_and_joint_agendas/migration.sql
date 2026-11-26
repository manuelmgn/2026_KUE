-- Group festival comparisons and joint agendas (SQLite)

CREATE TABLE "FestivalComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FestivalComparison_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FestivalComparison_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FestivalComparison_editionId_idx" ON "FestivalComparison"("editionId");
CREATE INDEX "FestivalComparison_createdById_idx" ON "FestivalComparison"("createdById");

CREATE TABLE "FestivalComparisonMember" (
    "comparisonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("comparisonId", "userId"),
    CONSTRAINT "FestivalComparisonMember_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "FestivalComparison" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FestivalComparisonMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FestivalComparisonMember_userId_idx" ON "FestivalComparisonMember"("userId");

CREATE TABLE "JointAgenda" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "comparisonId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "minRatingThreshold" REAL NOT NULL DEFAULT 3.2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JointAgenda_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "FestivalEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JointAgenda_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "FestivalComparison" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JointAgenda_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "JointAgenda_editionId_idx" ON "JointAgenda"("editionId");
CREATE INDEX "JointAgenda_comparisonId_idx" ON "JointAgenda"("comparisonId");
CREATE INDEX "JointAgenda_createdById_idx" ON "JointAgenda"("createdById");

CREATE TABLE "JointAgendaMember" (
    "agendaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("agendaId", "userId"),
    CONSTRAINT "JointAgendaMember_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "JointAgenda" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JointAgendaMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "JointAgendaMember_userId_idx" ON "JointAgendaMember"("userId");

CREATE TABLE "JointAgendaItem" (
    "agendaId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "addedById" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("agendaId", "entryId"),
    CONSTRAINT "JointAgendaItem_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "JointAgenda" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JointAgendaItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FestivalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JointAgendaItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "JointAgendaItem_entryId_idx" ON "JointAgendaItem"("entryId");
