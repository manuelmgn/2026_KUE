import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/server/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const { DATABASE_URL } = getEnv();

  if (DATABASE_URL.startsWith("postgresql://") || DATABASE_URL.startsWith("postgres://")) {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });
  return new PrismaClient({ adapter });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
