import { execFileSync } from "node:child_process";

const realDbUrl = process.env.DATABASE_URL?.trim() ?? "";
const isPostgres = /^postgres(ql)?:\/\//i.test(realDbUrl);
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const prismaEnv = isPostgres
  ? process.env
  : {
      ...process.env,
      DATABASE_URL: "postgresql://build:build@localhost:5432/kue?schema=public",
    };

console.info("[KUE Vercel Build] Generating PostgreSQL Prisma client...");
execFileSync(npxCommand, ["prisma", "generate"], {
  stdio: "inherit",
  env: prismaEnv,
});

if (isPostgres && process.env.SKIP_PRISMA_MIGRATE !== "1") {
  console.info("[KUE Vercel Build] Applying Prisma migrations (migrate deploy)...");
  execFileSync(npxCommand, ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
} else {
  console.warn(
    "[KUE Vercel Build] Skipping prisma migrate deploy (no PostgreSQL DATABASE_URL configured or SKIP_PRISMA_MIGRATE=1).",
  );
}

console.info("[KUE Vercel Build] Running next build...");
execFileSync(npxCommand, ["next", "build"], {
  stdio: "inherit",
  env: process.env,
});
