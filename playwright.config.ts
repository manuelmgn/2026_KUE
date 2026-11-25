import path from "node:path";
import { defineConfig } from "@playwright/test";

const E2E_PORT = 5035;
const E2E_DB_PATH = path.resolve(import.meta.dirname, "prisma/e2e.db");
const E2E_DB_URL = `file:${E2E_DB_PATH}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `rm -f "${E2E_DB_PATH}" && DATABASE_URL="${E2E_DB_URL}" npx prisma migrate deploy && DATABASE_URL="${E2E_DB_URL}" NODE_ENV=production PORT=${E2E_PORT} HOSTNAME=127.0.0.1 npx next start -p ${E2E_PORT}`,
    url: `http://127.0.0.1:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
