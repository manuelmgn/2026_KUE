import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/domain/errors";
import { PrismaClient } from "@/generated/prisma/client";
import {
  addEditionToUserFestivals,
  createFestival,
  createFestivalEdition,
  listUserEditions,
  removeEditionFromUserFestivals,
} from "@/server/services/festivals";
import { adminCreateUser, adminSetUserActive } from "@/server/services/users";

let tempDir = "";
let db: PrismaClient;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-fest-perm-int-db-"));
  const dbFile = path.join(tempDir, "test.db");
  const dbUrl = `file:${dbFile}`;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  db = new PrismaClient({ adapter });
}, 30_000);

beforeEach(async () => {
  await db.session.deleteMany();
  await db.userFestivalEdition.deleteMany();
  await db.festivalEntryArtist.deleteMany();
  await db.festivalEntry.deleteMany();
  await db.festivalEdition.deleteMany();
  await db.festival.deleteMany();
  await db.user.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("integration: festival & edition creation permissions", () => {
  it("allows active ADMIN to create festivals/editions, rejects normal USER and inactive ADMIN, and preserves catalog follow for USER", async () => {
    const admin = await adminCreateUser(
      {
        username: "admin_user",
        email: "admin@example.com",
        password: "Password123!",
        role: "ADMIN",
      },
      db,
    );
    const regularUser = await adminCreateUser(
      {
        username: "normal_user",
        email: "user@example.com",
        password: "Password123!",
        role: "USER",
      },
      db,
    );
    const inactiveAdmin = await adminCreateUser(
      {
        username: "inactive_admin",
        email: "inactive@example.com",
        password: "Password123!",
        role: "ADMIN",
      },
      db,
    );
    await adminSetUserActive(admin.id, { userId: inactiveAdmin.id, isActive: false }, db);

    // Active ADMIN can create a festival and a subsequent edition
    const created2026 = await createFestival(
      { name: "Rewire", year: 2026, location: "La Haya" },
      admin.id,
      db,
    );
    const created2027 = await createFestivalEdition(
      { festivalId: created2026.festival.id, year: 2027 },
      admin.id,
      db,
    );
    expect(created2027.festival.id).toBe(created2026.festival.id);

    // Normal USER cannot create a festival or an edition
    await expect(
      createFestival({ name: "Primavera", year: 2027 }, regularUser.id, db),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      createFestivalEdition(
        { festivalId: created2026.festival.id, year: 2028 },
        regularUser.id,
        db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Inactive ADMIN cannot create a festival or an edition
    await expect(
      createFestival({ name: "Sonar", year: 2027 }, inactiveAdmin.id, db),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      createFestivalEdition(
        { festivalId: created2026.festival.id, year: 2029 },
        inactiveAdmin.id,
        db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // No unauthorized rows were created
    expect(await db.festival.count()).toBe(1);
    expect(await db.festivalEdition.count()).toBe(2);

    // Normal USER can still add and remove existing catalog editions to/from personal festivals
    await addEditionToUserFestivals(regularUser.id, created2027.id, db);
    const userEditions = await listUserEditions(regularUser.id, db);
    expect(userEditions.map((ed) => ed.id)).toEqual([created2027.id]);

    await removeEditionFromUserFestivals(regularUser.id, created2027.id, db);
    expect(await listUserEditions(regularUser.id, db)).toHaveLength(0);
  });
});
