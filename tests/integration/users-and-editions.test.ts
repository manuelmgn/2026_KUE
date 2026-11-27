import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { PrismaClient } from "@/generated/prisma/client";
import { SlidingWindowRateLimiter } from "@/server/auth/rate-limit";
import { validateSessionToken } from "@/server/auth/session";
import {
  getArtistDetail,
  updateAlbumPin,
  updateArtistNotes,
  updateArtistRating,
} from "@/server/services/artists";
import { listFestivalEntries, updateEntrySchedule } from "@/server/services/entries";
import {
  addEditionToUserFestivals,
  createFestival,
  createFestivalEdition,
  listAllCatalogFestivals,
  listUserEditions,
  removeEditionFromUserFestivals,
} from "@/server/services/festivals";
import { importFestivalLineup } from "@/server/services/importer";
import {
  createInvitationLink,
  listInvitationLinks,
  revokeInvitationLink,
  validateInvitationToken,
} from "@/server/services/invitations";
import {
  adminCreateUser,
  adminDeleteUser,
  adminResetUserPassword,
  adminSetUserActive,
  adminSetUserRole,
  authenticateUser,
  changeOwnPassword,
  ensureBootstrapAdmin,
  getAdminDashboardData,
  registerUser,
} from "@/server/services/users";

let tempDir = "";
let db: PrismaClient;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-users-int-db-"));
  const dbFile = path.join(tempDir, "test.db");
  const dbUrl = `file:${dbFile}`;

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  db = new PrismaClient({ adapter });
});

beforeEach(async () => {
  await db.session.deleteMany();
  await db.userEntryState.deleteMany();
  await db.userAlbumState.deleteMany();
  await db.userArtistState.deleteMany();
  await db.userFestivalEdition.deleteMany();
  await db.festivalEntryArtist.deleteMany();
  await db.festivalEntry.deleteMany();
  await db.album.deleteMany();
  await db.artist.deleteMany();
  await db.festivalEdition.deleteMany();
  await db.festival.deleteMany();
  await db.legacyPersonalItem.deleteMany();
  await db.appSetting.deleteMany();
  await db.user.deleteMany();
  await db.invitationLink.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("integration: multi-user auth, admin dashboard, editions, and shared catalog", () => {
  it("promotes first user to ADMIN, claims legacy data, and enforces registration & admin guards", async () => {
    // Seed a pre-existing festival edition and legacy artist rating before any user exists
    const brand = await db.festival.create({
      data: { slug: "rewire", name: "Rewire", normalizedName: "rewire" },
    });
    const edition = await db.festivalEdition.create({
      data: { festivalId: brand.id, slug: "rewire-2026", year: 2026 },
    });
    const artist = await db.artist.create({
      data: { name: "Tim Hecker", normalizedName: "tim hecker" },
    });
    await db.legacyPersonalItem.create({
      data: {
        kind: "ARTIST",
        targetId: artist.id,
        rating: 5,
        status: "RATED",
        notes: "Legacy note",
      },
    });

    const limiter = new SlidingWindowRateLimiter(100, 60_000);
    const first = await registerUser(
      { username: "AliceAdmin", email: "alice@example.com", password: "password1234" },
      { db, rateLimiter: limiter },
    );
    expect(first.isFirstAdmin).toBe(true);
    expect(first.user.role).toBe("ADMIN");

    // Legacy edition and artist rating were automatically claimed by first admin
    const adminEditions = await listUserEditions(first.user.id, db);
    expect(adminEditions.map((e) => e.id)).toEqual([edition.id]);
    const detail = await getArtistDetail(first.user.id, artist.id, db);
    expect(detail?.rating).toBe(5);
    expect(detail?.notes).toBe("Legacy note");

    // Registration without a valid invite link must fail once an admin exists
    await expect(
      registerUser(
        { username: "bob", email: "bob@example.com", password: "password1234" },
        { db, rateLimiter: limiter },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    await expect(
      registerUser(
        {
          username: "bob",
          email: "bob@example.com",
          password: "password1234",
          inviteToken: "non-existent-token",
        },
        { db, rateLimiter: limiter },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    expect((await validateInvitationToken(null, db)).status).toBe("missing");
    expect((await validateInvitationToken("non-existent-token", db)).status).toBe("invalid");

    // Default invitation link allows 2 uses and expires in ~7 days
    const defaultInvite = await createInvitationLink(first.user.id, {}, db);
    expect(defaultInvite.maxUses).toBe(2);
    expect(defaultInvite.usedCount).toBe(0);
    expect(defaultInvite.remainingUses).toBe(2);
    expect(defaultInvite.status).toBe("ACTIVE");
    const deltaMs =
      new Date(defaultInvite.expiresAt).getTime() - new Date(defaultInvite.createdAt).getTime();
    expect(deltaMs).toBe(7 * 24 * 60 * 60 * 1000);

    // Register 2 users via defaultInvite -> 3rd registration is rejected as exhausted
    const invitedOne = await registerUser(
      {
        username: "invited_one",
        email: "one@example.com",
        password: "password1234",
        inviteToken: defaultInvite.token,
      },
      { db, rateLimiter: limiter },
    );
    expect(invitedOne.isFirstAdmin).toBe(false);
    expect(invitedOne.user.role).toBe("USER");

    const invitedTwo = await registerUser(
      {
        username: "invited_two",
        email: "two@example.com",
        password: "password1234",
        inviteToken: defaultInvite.token,
      },
      { db, rateLimiter: limiter },
    );
    expect(invitedTwo.user.role).toBe("USER");

    expect((await validateInvitationToken(defaultInvite.token, db)).status).toBe("exhausted");
    await expect(
      registerUser(
        {
          username: "invited_three",
          email: "three@example.com",
          password: "password1234",
          inviteToken: defaultInvite.token,
        },
        { db, rateLimiter: limiter },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // Revoking an active invitation blocks further registration immediately
    const revocableInvite = await createInvitationLink(
      first.user.id,
      { maxUses: 5, duration: "5h" },
      db,
    );
    expect((await validateInvitationToken(revocableInvite.token, db)).status).toBe("valid");
    const revokedInvite = await revokeInvitationLink({ invitationId: revocableInvite.id }, db);
    expect(revokedInvite.status).toBe("REVOKED");
    expect((await validateInvitationToken(revocableInvite.token, db)).status).toBe("revoked");
    await expect(
      registerUser(
        {
          username: "blocked_revoked",
          email: "revoked@example.com",
          password: "password1234",
          inviteToken: revocableInvite.token,
        },
        { db, rateLimiter: limiter },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // Expired invitation link is rejected
    const expiredInvite = await createInvitationLink(
      first.user.id,
      { maxUses: 1, duration: "30d" },
      db,
    );
    await db.invitationLink.update({
      where: { id: expiredInvite.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect((await validateInvitationToken(expiredInvite.token, db)).status).toBe("expired");
    await expect(
      registerUser(
        {
          username: "blocked_expired",
          email: "expired@example.com",
          password: "password1234",
          inviteToken: expiredInvite.token,
        },
        { db, rateLimiter: limiter },
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // Keep one active invite to verify activeInvitations stat
    const activeInvite = await createInvitationLink(
      first.user.id,
      { maxUses: 3, duration: "72h" },
      db,
    );
    const listedInvites = await listInvitationLinks(db);
    expect(listedInvites.find((i) => i.id === defaultInvite.id)?.registeredUsernames).toEqual([
      "invited_one",
      "invited_two",
    ]);

    const bob = await adminCreateUser(
      { username: "bob", email: "bob@example.com", password: "password1234", role: "USER" },
      db,
    );
    expect(bob.role).toBe("USER");

    // Bob authenticates and gets a valid DB session
    const bobLogin = await authenticateUser(
      { username: "BOB", password: "password1234" },
      { db, rateLimiter: limiter },
    );
    expect(await validateSessionToken(bobLogin.rawToken, db)).not.toBeNull();

    // Admin suspends Bob -> session is immediately invalidated and login is rejected
    await adminSetUserActive(first.user.id, { userId: bob.id, isActive: false }, db);
    expect(await validateSessionToken(bobLogin.rawToken, db)).toBeNull();
    await expect(
      authenticateUser({ username: "bob", password: "password1234" }, { db, rateLimiter: limiter }),
    ).rejects.toBeInstanceOf(DomainError);

    // Admin reactivates and resets password
    await adminSetUserActive(first.user.id, { userId: bob.id, isActive: true }, db);
    await adminResetUserPassword({ userId: bob.id, newPassword: "newpassword999" }, db);
    const bobReLogin = await authenticateUser(
      { username: "bob", password: "newpassword999" },
      { db, rateLimiter: limiter },
    );
    expect(bobReLogin.user.id).toBe(bob.id);

    // Admin cannot demote, suspend, or delete themselves
    await expect(
      adminSetUserRole(first.user.id, { userId: first.user.id, role: "USER" }, db),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      adminSetUserActive(first.user.id, { userId: first.user.id, isActive: false }, db),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      adminDeleteUser(first.user.id, { userId: first.user.id }, db),
    ).rejects.toBeInstanceOf(DomainError);

    // Password change revokes other sessions while keeping current session active
    const bobSecondSession = await authenticateUser(
      { username: "bob", password: "newpassword999" },
      { db, rateLimiter: limiter },
    );
    const validatedSecond = await validateSessionToken(bobSecondSession.rawToken, db);
    if (!validatedSecond) throw new Error("Expected valid session");

    await changeOwnPassword(
      bob.id,
      { currentPassword: "newpassword999", newPassword: "evennewerpass123" },
      validatedSecond.user.sessionId,
      db,
    );
    expect(await validateSessionToken(bobSecondSession.rawToken, db)).not.toBeNull();
    expect(await validateSessionToken(bobReLogin.rawToken, db)).toBeNull();

    // Dashboard stats reflect live state
    const dashboard = await getAdminDashboardData(db);
    expect(dashboard.stats.totalUsers).toBe(4);
    expect(dashboard.stats.activeInvitations).toBe(1);
    expect(activeInvite.status).toBe("ACTIVE");
  });

  it("shares festivals and annual editions globally while isolating Mis Festivales and personal ratings per user", async () => {
    const limiter = new SlidingWindowRateLimiter(100, 60_000);
    const alice = await registerUser(
      { username: "alice", email: "alice@example.com", password: "password1234" },
      { db, rateLimiter: limiter },
    );
    const bobInvite = await createInvitationLink(
      alice.user.id,
      { maxUses: 1, duration: "24h" },
      db,
    );
    const bob = await registerUser(
      {
        username: "bob",
        email: "bob@example.com",
        password: "password1234",
        inviteToken: bobInvite.token,
      },
      { db, rateLimiter: limiter },
    );

    // Alice creates Rewire 2026 and adds a second edition Rewire 2027 under the same Festival brand
    const rewire2026 = await createFestival(
      { name: "Rewire", year: 2026, location: "La Haya" },
      alice.user.id,
      db,
    );
    const rewire2027 = await createFestivalEdition(
      { festivalId: rewire2026.festival.id, year: 2027 },
      alice.user.id,
      db,
    );

    expect(rewire2027.festival.id).toBe(rewire2026.festival.id);
    expect(rewire2027.location).toBe("La Haya"); // Inherited from parent Festival

    // Import lineup into Rewire 2027
    await importFestivalLineup(
      {
        festivalId: rewire2027.id,
        rows: [
          {
            billingName: "Mabe Fratti",
            artistNames: ["Mabe Fratti"],
            subtitle: null,
            day: "Saturday",
            stage: "Korzo",
            setTime: "21:00",
            included: true,
          },
        ],
      },
      { db, enqueueSync: false },
    );

    // Bob has 0 editions in "Mis festivales", but sees Rewire (2026 & 2027) in the shared catalog
    expect(await listUserEditions(bob.user.id, db)).toHaveLength(0);
    const bobCatalog = await listAllCatalogFestivals(bob.user.id, db);
    expect(bobCatalog).toHaveLength(1);
    expect(bobCatalog[0]?.editions.map((e) => e.year)).toEqual([2027, 2026]);
    expect(bobCatalog[0]?.editions.every((e) => !e.isAdded)).toBe(true);

    // Bob adds ONLY Rewire 2027 to his "Mis festivales"
    await addEditionToUserFestivals(bob.user.id, rewire2027.id, db);
    const bobMine = await listUserEditions(bob.user.id, db);
    expect(bobMine.map((e) => e.slug)).toEqual(["rewire-2027"]);

    // Alice and Bob rate/note the same artist & album & live set independently
    const artist = await db.artist.findFirstOrThrow({ where: { normalizedName: "mabe fratti" } });
    const album = await db.album.create({
      data: { artistId: artist.id, title: "Sentir que no sabes", releaseYear: 2024 },
    });
    const entry = await db.festivalEntry.findFirstOrThrow({ where: { editionId: rewire2027.id } });

    await updateArtistRating(alice.user.id, { artistId: artist.id, rating: 5 }, db);
    await updateArtistNotes(alice.user.id, { artistId: artist.id, notes: "Alice favorite" }, db);
    await updateAlbumPin(alice.user.id, { albumId: album.id, isPinned: true }, db);
    await updateEntrySchedule(
      alice.user.id,
      { entryId: entry.id, setTime: "21:30", liveRating: 5, liveNotes: "Alice live note" },
      db,
    );

    await updateArtistRating(bob.user.id, { artistId: artist.id, rating: 2 }, db);
    await updateArtistNotes(bob.user.id, { artistId: artist.id, notes: "Bob note" }, db);
    await updateEntrySchedule(
      bob.user.id,
      { entryId: entry.id, liveRating: 3, liveNotes: "Bob live note" },
      db,
    );

    // Verify complete personal isolation + shared schedule update ("21:30")
    const [aliceEntries, bobEntries] = await Promise.all([
      listFestivalEntries(alice.user.id, rewire2027.id, {}, db),
      listFestivalEntries(bob.user.id, rewire2027.id, {}, db),
    ]);

    expect(aliceEntries[0]?.setTime).toBe("21:30");
    expect(bobEntries[0]?.setTime).toBe("21:30");
    expect(aliceEntries[0]?.liveRating).toBe(5);
    expect(bobEntries[0]?.liveRating).toBe(3);
    expect(aliceEntries[0]?.artists[0]?.artist.rating).toBe(5);
    expect(bobEntries[0]?.artists[0]?.artist.rating).toBe(2);

    const [aliceDetail, bobDetail] = await Promise.all([
      getArtistDetail(alice.user.id, artist.id, db),
      getArtistDetail(bob.user.id, artist.id, db),
    ]);
    expect(aliceDetail?.albums[0]?.isPinned).toBe(true);
    expect(bobDetail?.albums[0]?.isPinned).toBe(false);

    // Bob removing Rewire 2027 from "Mis festivales" leaves it intact for Alice and catalog
    await removeEditionFromUserFestivals(bob.user.id, rewire2027.id, db);
    expect(await listUserEditions(bob.user.id, db)).toHaveLength(0);
    expect(await listUserEditions(alice.user.id, db)).toHaveLength(2);
  });

  it("bootstraps admin cleanly (even with quoted env vars), blocks public first-user hijack, and supports login by username or email", async () => {
    const prevUser = process.env.ADMIN_USERNAME;
    const prevEmail = process.env.ADMIN_EMAIL;
    const prevPass = process.env.ADMIN_PASSWORD;
    const limiter = new SlidingWindowRateLimiter(100, 60_000);

    try {
      process.env.ADMIN_USERNAME = '"admin"';
      process.env.ADMIN_EMAIL = '"admin@example.com"';
      process.env.ADMIN_PASSWORD = '"SuperSecret123"';

      // Even if someone tries to race /register before bootstrap runs, first-user registration is blocked
      await expect(
        registerUser(
          { username: "attacker", email: "attacker@example.com", password: "password1234" },
          { db, rateLimiter: limiter },
        ),
      ).rejects.toBeInstanceOf(DomainError);

      // Login triggers ensureBootstrapAdmin and works with either username or email
      const byUsername = await authenticateUser(
        { username: "admin", password: "SuperSecret123" },
        { db, rateLimiter: limiter },
      );
      expect(byUsername.user.role).toBe("ADMIN");

      const byEmail = await authenticateUser(
        { username: "ADMIN@EXAMPLE.COM", password: "SuperSecret123" },
        { db, rateLimiter: limiter },
      );
      expect(byEmail.user.id).toBe(byUsername.user.id);

      // Subsequent ensureBootstrapAdmin is a no-op
      expect(await ensureBootstrapAdmin(db)).toBe(false);
    } finally {
      if (prevUser === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = prevUser;

      if (prevEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prevEmail;

      if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prevPass;
    }
  });
});
