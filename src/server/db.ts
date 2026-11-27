import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/server/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const { DATABASE_URL, DATABASE_URL_POOLED } = getEnv();
  const runtimeUrl = DATABASE_URL_POOLED ?? DATABASE_URL;

  if (runtimeUrl.startsWith("postgresql://") || runtimeUrl.startsWith("postgres://")) {
    const pool = new Pool({ connectionString: runtimeUrl });
    attachDatabasePool(pool);
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: runtimeUrl });
  return new PrismaClient({ adapter });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
