import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // .env is optional (e.g., inside Docker where env vars are injected directly)
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres =
  databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");

export default defineConfig({
  schema: isPostgres ? "prisma/schema.postgresql.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isPostgres ? "prisma/migrations-pg" : "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
