import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, ForbiddenError } from "@/domain/errors";
import { PrismaClient } from "@/generated/prisma/client";
import { SlidingWindowRateLimiter } from "@/server/auth/rate-limit";
import { updateArtistRating, updateArtistStatus } from "@/server/services/artists";
import {
  addEditionToUserFestivals,
  createFestival,
  removeEditionFromUserFestivals,
} from "@/server/services/festivals";
import {
  acceptFriendRequest,
  removeOrRejectFriendship,
  sendFriendRequest,
} from "@/server/services/friends";
import {
  createFestivalComparison,
  createJointAgenda,
  deleteFestivalComparison,
  deleteJointAgenda,
  getFestivalComparison,
  getJointAgenda,
  getSavedFestivalComparison,
  leaveJointAgenda,
  listCoincidingFestivals,
  listJointAgendas,
  listSavedFestivalComparisons,
  regenerateJointAgenda,
  setJointAgendaEntry,
  updateFestivalComparison,
  updateJointAgenda,
} from "@/server/services/group-planning";
import { importFestivalLineup } from "@/server/services/importer";
import { updateOwnPrivacy } from "@/server/services/profile";
import { registerUser } from "@/server/services/users";

let tempDir = "";
let db: PrismaClient;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-group-planning-int-db-"));
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
  await db.jointAgendaItem.deleteMany();
  await db.jointAgendaMember.deleteMany();
  await db.jointAgenda.deleteMany();
  await db.festivalComparisonMember.deleteMany();
  await db.festivalComparison.deleteMany();
  await db.notification.deleteMany();
  await db.friendship.deleteMany();
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
});

afterAll(async () => {
  await db.$disconnect();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function seedUser(username: string) {
  const limiter = new SlidingWindowRateLimiter(100, 60_000);
  const res = await registerUser(
    {
      username,
      email: `${username}@example.com`,
      password: "Password123!",
    },
    { db, rateLimiter: limiter },
  );
  return res.user;
}

async function makeFriends(userIdA: string, userIdB: string) {
  await sendFriendRequest(userIdA, { targetUserId: userIdB }, { db });
  await acceptFriendRequest(userIdB, { targetUserId: userIdA }, db);
}

describe("integration: festival comparative table (>= 3.2) and joint agendas", () => {
  it("computes comparative tables, triggers automatic >= 3.2 recommendation, and builds collaborative joint agendas", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");
    const clara = await seedUser("clara");
    const outsider = await seedUser("outsider");

    await makeFriends(alice.id, bob.id);
    await makeFriends(alice.id, clara.id);
    await makeFriends(bob.id, clara.id);

    const edition = await createFestival(
      { name: "Rewire", year: 2027, location: "The Hague" },
      alice.id,
      db,
    );

    // Before friends join, Alice cannot generate a comparative table alone
    await expect(getFestivalComparison(alice.id, { editionId: edition.id }, db)).rejects.toThrow(
      DomainError,
    );

    await addEditionToUserFestivals(bob.id, edition.id, db);
    await addEditionToUserFestivals(clara.id, edition.id, db);

    await importFestivalLineup(
      {
        festivalId: edition.id,
        rows: [
          {
            billingName: "Kali Malone",
            artistNames: ["Kali Malone"],
            subtitle: null,
            day: "Viernes",
            stage: "Grote Kerk",
            setTime: "20:00",
            included: true,
          },
          {
            billingName: "Tim Hecker",
            artistNames: ["Tim Hecker"],
            subtitle: null,
            day: "Viernes",
            stage: "Paard",
            setTime: "20:30",
            included: true,
          },
          {
            billingName: "BoringFiller",
            artistNames: ["BoringFiller"],
            subtitle: null,
            day: "Sábado",
            stage: "Hall",
            setTime: "18:00",
            included: true,
          },
        ],
      },
      { db, enqueueSync: false, actorUserId: alice.id },
    );

    const entries = await db.festivalEntry.findMany({
      where: { editionId: edition.id },
      include: { artists: { include: { artist: true } } },
    });
    const kaliEntry = entries.find((e) => e.billingName === "Kali Malone");
    const timEntry = entries.find((e) => e.billingName === "Tim Hecker");
    const fillerEntry = entries.find((e) => e.billingName === "BoringFiller");
    if (!kaliEntry || !timEntry || !fillerEntry) {
      throw new Error("Expected seeded entries to exist");
    }

    const kaliArtistId = kaliEntry.artists[0]?.artist.id ?? "";
    const timArtistId = timEntry.artists[0]?.artist.id ?? "";
    const fillerArtistId = fillerEntry.artists[0]?.artist.id ?? "";

    // 1. Low initial ratings -> average < 3.2 -> NOT_RECOMMENDED
    // Scores: Alice (3, 3, 2) + Bob (3, 2) = 13 / 5 = 2.60 < 3.2
    await updateArtistRating(alice.id, { artistId: kaliArtistId, rating: 3 }, db);
    await updateArtistRating(alice.id, { artistId: timArtistId, rating: 3 }, db);
    await updateArtistRating(alice.id, { artistId: fillerArtistId, rating: 2 }, db);
    await updateArtistRating(bob.id, { artistId: kaliArtistId, rating: 3 }, db);
    await updateArtistRating(bob.id, { artistId: fillerArtistId, rating: 2 }, db);

    const initialComp = await getFestivalComparison(alice.id, { editionId: edition.id }, db);
    expect(initialComp.participants).toHaveLength(3);
    expect(initialComp.recommendation.averageRating).toBe(2.6);
    expect(initialComp.recommendation.recommended).toBe(false);
    expect(initialComp.recommendation.verdict).toBe("NOT_RECOMMENDED");

    // Non-friend / non-follower cannot be selected
    await expect(
      getFestivalComparison(alice.id, { editionId: edition.id, friendIds: [outsider.id] }, db),
    ).rejects.toThrow(DomainError);

    // 2. Friends upgrade ratings so average hits >= 3.2!
    // Alice: Kali=5, Tim=4, Filler=2 (sum 11)
    // Bob: Kali=5, Tim=4, Filler=DISCARDED (sum 9; discarded excluded!)
    // Clara: Kali=4, Tim=3 (sum 7)
    // Total: (11 + 9 + 7) / 7 = 27 / 7 = 3.86 >= 3.2 -> RECOMMENDED!
    await updateArtistRating(alice.id, { artistId: kaliArtistId, rating: 5 }, db);
    await updateArtistRating(alice.id, { artistId: timArtistId, rating: 4 }, db);
    await updateArtistRating(bob.id, { artistId: kaliArtistId, rating: 5 }, db);
    await updateArtistRating(bob.id, { artistId: timArtistId, rating: 4 }, db);
    await updateArtistStatus(bob.id, { artistId: fillerArtistId, status: "DISCARDED" }, db);
    await updateArtistRating(clara.id, { artistId: kaliArtistId, rating: 4 }, db);
    await updateArtistRating(clara.id, { artistId: timArtistId, rating: 3 }, db);

    const savedComparison = await createFestivalComparison(
      alice.id,
      {
        editionId: edition.id,
        friendIds: [bob.id, clara.id],
        name: "Trío La Haya",
      },
      db,
    );

    expect(savedComparison.name).toBe("Trío La Haya");
    expect(savedComparison.recommendation.averageRating).toBe(3.86);
    expect(savedComparison.recommendation.recommended).toBe(true);
    expect(savedComparison.recommendation.verdict).toBe("RECOMMENDED");

    const loadedByBob = await getSavedFestivalComparison(bob.id, savedComparison.id, {
      sortBy: "AVG_DESC",
      db,
    });
    expect(loadedByBob.rows[0]?.billingName).toBe("Kali Malone");
    expect(loadedByBob.recommendation.recommended).toBe(true);

    // Coinciding festivals overview reflects the saved comparison
    const coincidences = await listCoincidingFestivals(alice.id, db);
    expect(coincidences).toHaveLength(1);
    expect(coincidences[0]?.coincidingFriends.map((f) => f.username)).toEqual(["bob", "clara"]);
    expect(coincidences[0]?.savedComparisonsCount).toBe(1);

    // 3. Create a Joint Agenda directly from the saved comparison (default strategy: RECOMMENDED >= 3.2)
    const agenda = await createJointAgenda(
      alice.id,
      {
        comparisonId: savedComparison.id,
        name: "Ruta Rewire Viernes/Sábado",
      },
      db,
    );

    expect(agenda.comparisonId).toBe(savedComparison.id);
    // Kali (avg 4.67) and Tim (avg 3.67) are >= 3.2; BoringFiller (avg 2.0) is excluded!
    expect(agenda.items.map((i) => i.billingName)).toEqual(["Kali Malone", "Tim Hecker"]);
    // Kali (20:00) and Tim (20:30) on Viernes overlap -> clash detected automatically!
    expect(agenda.conflicts).toHaveLength(1);
    expect(agenda.items[0]?.hasClash).toBe(true);
    expect(agenda.items[1]?.hasClash).toBe(true);

    // 4. Collaborative editing by friend (Bob adds group note on Kali & manually adds BoringFiller)
    const afterBobEdit = await setJointAgendaEntry(
      bob.id,
      {
        agendaId: agenda.id,
        entryId: kaliEntry.id,
        note: "Entrar 20 min antes para coger banco en la iglesia",
      },
      db,
    );
    expect(afterBobEdit.items.find((i) => i.entryId === kaliEntry.id)?.note).toContain(
      "Entrar 20 min antes",
    );

    const afterManualAdd = await setJointAgendaEntry(
      bob.id,
      {
        agendaId: agenda.id,
        entryId: fillerEntry.id,
        included: true,
        note: "Solo si nos sobra energía",
      },
      db,
    );
    expect(afterManualAdd.items).toHaveLength(3);

    // Outsider cannot read or edit the joint agenda
    await expect(getJointAgenda(outsider.id, agenda.id, db)).rejects.toThrow(ForbiddenError);
    await expect(
      setJointAgendaEntry(outsider.id, { agendaId: agenda.id, entryId: kaliEntry.id }, db),
    ).rejects.toThrow(ForbiddenError);

    // Non-creator cannot rename or delete agenda, only creator can
    await expect(
      updateJointAgenda(bob.id, { agendaId: agenda.id, name: "Hack" }, db),
    ).rejects.toThrow(ForbiddenError);
    await expect(deleteJointAgenda(bob.id, { agendaId: agenda.id }, db)).rejects.toThrow(
      ForbiddenError,
    );

    // Regenerate with MUST_SEE (>= 4.0) without preserving manual entries -> keeps only Kali Malone (4.67) and preserves Kali's note!
    const regenerated = await regenerateJointAgenda(
      alice.id,
      {
        agendaId: agenda.id,
        strategy: "MUST_SEE",
        preserveManualEntries: false,
      },
      db,
    );
    expect(regenerated.items.map((i) => i.entryId)).toEqual([kaliEntry.id]);
    expect(regenerated.items[0]?.note).toContain("Entrar 20 min antes");

    // Clara leaves the joint agenda; Bob still sees it
    await leaveJointAgenda(clara.id, { agendaId: agenda.id }, db);
    const claraAgendas = await listJointAgendas(clara.id, { db });
    expect(claraAgendas).toHaveLength(0);

    // Creator updates & deletes comparison and agenda cleanly
    await updateFestivalComparison(
      alice.id,
      { comparisonId: savedComparison.id, name: "Dúo La Haya", friendIds: [bob.id] },
      db,
    );
    const listedComps = await listSavedFestivalComparisons(alice.id, { db });
    expect(listedComps[0]?.name).toBe("Dúo La Haya");

    await deleteFestivalComparison(alice.id, { comparisonId: savedComparison.id }, db);
    // Deleting comparison sets comparisonId = null on JointAgenda (onDelete: SetNull), keeping the agenda alive!
    const agendaStillAlive = await getJointAgenda(alice.id, agenda.id, db);
    expect(agendaStillAlive.comparisonId).toBeNull();

    await deleteJointAgenda(alice.id, { agendaId: agenda.id }, db);
    expect(await listJointAgendas(alice.id, { db })).toHaveLength(0);
  });

  it("strictly enforces retroactive privacy and prevents friends-of-friends or post-unfriend leaks", async () => {
    const alice = await seedUser("alice_priv");
    const bob = await seedUser("bob_priv");
    const charlie = await seedUser("charlie_priv");

    // Alice is friends with Bob and Charlie, but Bob and Charlie are NOT friends with each other!
    await makeFriends(alice.id, bob.id);
    await makeFriends(alice.id, charlie.id);

    const edition = await createFestival({ name: "Unsound", year: 2027 }, alice.id, db);
    await addEditionToUserFestivals(bob.id, edition.id, db);
    await addEditionToUserFestivals(charlie.id, edition.id, db);

    await importFestivalLineup(
      {
        festivalId: edition.id,
        rows: [
          {
            billingName: "Autechre",
            artistNames: ["Autechre"],
            subtitle: null,
            day: "Sábado",
            stage: "Hotel Forum",
            setTime: "23:00",
            included: true,
          },
        ],
      },
      { db, enqueueSync: false, actorUserId: alice.id },
    );

    const entry = await db.festivalEntry.findFirstOrThrow({
      where: { editionId: edition.id },
      include: { artists: true },
    });
    const artistId = entry.artists[0]?.artistId ?? "";

    // Alice rates 2, Bob rates 5, Charlie rates 5
    await updateArtistRating(alice.id, { artistId, rating: 2 }, db);
    await updateArtistRating(bob.id, { artistId, rating: 5 }, db);
    await updateArtistRating(charlie.id, { artistId, rating: 5 }, db);

    const agenda = await createJointAgenda(
      alice.id,
      {
        editionId: edition.id,
        friendIds: [bob.id, charlie.id],
      },
      db,
    );

    // Alice sees all 3 participants -> avg (2 + 5 + 5) / 3 = 4.0 -> RECOMMENDED
    expect(agenda.participants).toHaveLength(3);
    expect(agenda.recommendation.averageRating).toBe(4);
    expect(agenda.recommendation.recommended).toBe(true);

    // Bob is NOT friends with Charlie -> when Bob views the agenda, Charlie is NOT leaked!
    // Bob only sees [Bob, Alice] -> avg (5 + 2) / 2 = 3.5
    const bobView = await getJointAgenda(bob.id, agenda.id, db);
    expect(bobView.participants.map((p) => p.user.username)).toEqual(["bob_priv", "alice_priv"]);
    expect(bobView.recommendation.averageRating).toBe(3.5);

    // Now Bob sets ratingsVisibility = PRIVATE!
    // When Alice views the agenda, Bob's rating is masked AND excluded from averages:
    // Alice (2) + Charlie (5) -> 7 / 2 = 3.5 (cannot reverse-engineer Bob's private score!)
    await updateOwnPrivacy(bob.id, { ratingsVisibility: "PRIVATE" }, db);
    const aliceAfterBobPrivateRatings = await getJointAgenda(alice.id, agenda.id, db);
    const bobParticipant = aliceAfterBobPrivateRatings.participants.find(
      (p) => p.user.id === bob.id,
    );
    expect(bobParticipant?.ratingsVisible).toBe(false);
    expect(bobParticipant?.averageRating).toBeNull();
    expect(aliceAfterBobPrivateRatings.recommendation.averageRating).toBe(3.5);

    // Now Charlie sets festivalsVisibility = PRIVATE!
    // When Alice views the agenda, Charlie disappears from visible participants, leaving only Alice (2) + Bob (masked) -> avg 2.0 < 3.2 -> NOT_RECOMMENDED!
    await updateOwnPrivacy(charlie.id, { festivalsVisibility: "PRIVATE" }, db);
    const aliceAfterCharliePrivateFest = await getJointAgenda(alice.id, agenda.id, db);
    expect(aliceAfterCharliePrivateFest.participants.map((p) => p.user.username)).toEqual([
      "alice_priv",
      "bob_priv",
    ]);
    expect(aliceAfterCharliePrivateFest.recommendation.averageRating).toBe(2);
    expect(aliceAfterCharliePrivateFest.recommendation.recommended).toBe(false);

    // Unfriending Bob removes Bob from Alice's visible participants AND revokes Bob's access to Alice's agenda!
    await removeOrRejectFriendship(alice.id, { targetUserId: bob.id }, db);
    const aliceAfterUnfriend = await getJointAgenda(alice.id, agenda.id, db);
    expect(aliceAfterUnfriend.participants.map((p) => p.user.username)).toEqual(["alice_priv"]);
    expect(await listJointAgendas(bob.id, { db })).toHaveLength(0);
    await expect(getJointAgenda(bob.id, agenda.id, db)).rejects.toThrow(ForbiddenError);

    // If Bob removes the festival from his list, Bob still cannot open the agenda
    await removeEditionFromUserFestivals(bob.id, edition.id, db);
    await expect(getJointAgenda(bob.id, agenda.id, db)).rejects.toThrow(DomainError);
  });
});
