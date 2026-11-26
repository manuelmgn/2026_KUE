import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { SlidingWindowRateLimiter } from "@/server/auth/rate-limit";
import { getArtistDetail, updateArtistNotes, updateArtistRating } from "@/server/services/artists";
import { updateEntrySchedule } from "@/server/services/entries";
import {
  addEditionToUserFestivals,
  createFestival,
  updateFestival,
} from "@/server/services/festivals";
import {
  acceptFriendRequest,
  listFriendsOverview,
  removeOrRejectFriendship,
  searchUsersForFriends,
  sendFriendRequest,
} from "@/server/services/friends";
import { importFestivalLineup } from "@/server/services/importer";
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import {
  getUserProfileByUsername,
  listFriendsActivityFeed,
  removeOwnAvatar,
  updateOwnPrivacy,
  updateOwnProfile,
  uploadOwnAvatar,
} from "@/server/services/profile";
import { adminSetUserActive, registerUser } from "@/server/services/users";

let tempDir = "";
let mediaDir = "";
let db: PrismaClient;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-social-int-db-"));
  mediaDir = path.join(tempDir, "media");
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

describe("integration: user profiles, friendships, privacy matrix, and notifications", () => {
  it("handles profile editing, avatar upload/removal, user search, and friend lifecycle", async () => {
    const admin = await seedUser("martinl");
    const marta = await seedUser("marta_gz");
    const carlos = await seedUser("carlos_pt");
    const suspended = await seedUser("ghost_user");

    await adminSetUserActive(admin.id, { userId: suspended.id, isActive: false }, db);

    const updatedProfile = await updateOwnProfile(
      marta.id,
      {
        displayName: "Marta Gómez",
        location: "Santiago de Compostela",
        bio: "Ambient, drone e iglesias.",
      },
      db,
    );
    expect(updatedProfile.displayName).toBe("Marta Gómez");
    expect(updatedProfile.location).toBe("Santiago de Compostela");

    const samplePng = await sharp({
      create: { width: 128, height: 128, channels: 3, background: { r: 80, g: 80, b: 80 } },
    })
      .png()
      .toBuffer();

    const { avatarPath } = await uploadOwnAvatar(marta.id, samplePng, {
      db,
      mediaDir,
      rateLimiter: new SlidingWindowRateLimiter(20, 60_000),
    });
    expect(avatarPath).toMatch(/^avatars\/usr_/);

    // Search excludes self and suspended accounts
    const foundMarta = await searchUsersForFriends(admin.id, "Marta", db);
    expect(foundMarta.map((u) => u.username)).toEqual(["marta_gz"]);
    expect(foundMarta[0]?.relationship).toBe("NONE");

    const foundSuspended = await searchUsersForFriends(admin.id, "ghost", db);
    expect(foundSuspended).toHaveLength(0);

    // Non-friend cannot see Marta's festivals or activity
    const rewire = await createFestival({ name: "Rewire", year: 2027 }, marta.id, db);
    const strangerView = await getUserProfileByUsername(admin.id, "marta_gz", db);
    expect(strangerView?.relationship).toBe("NONE");
    expect(strangerView?.canViewFestivals).toBe(false);
    expect(strangerView?.canViewActivity).toBe(false);
    expect(strangerView?.festivals).toHaveLength(0);
    expect(strangerView?.posts).toHaveLength(0);
    void rewire;

    // Send friend request: admin -> marta
    const sent = await sendFriendRequest(admin.id, { targetUserId: marta.id }, { db });
    expect(sent.status).toBe("PENDING");

    // Marta receives unread notification with live pendingFriendshipId
    const martaNotifs1 = await listUserNotifications(marta.id, { db });
    expect(martaNotifs1.unreadCount).toBe(1);
    expect(martaNotifs1.items[0]?.type).toBe("FRIEND_REQUEST_RECEIVED");
    expect(martaNotifs1.items[0]?.pendingFriendshipId).toBe(sent.friendshipId);

    // Crossed request auto-accept: carlos -> admin, then admin -> carlos
    await sendFriendRequest(carlos.id, { targetUserId: admin.id }, { db });
    const crossed = await sendFriendRequest(admin.id, { targetUserId: carlos.id }, { db });
    expect(crossed.status).toBe("ACCEPTED");

    const carlosNotifs = await listUserNotifications(carlos.id, { db });
    expect(carlosNotifs.items.some((n) => n.type === "FRIEND_REQUEST_ACCEPTED")).toBe(true);

    // Marta accepts admin's request
    await acceptFriendRequest(marta.id, { targetUserId: admin.id }, db);
    const martaNotifsAfter = await listUserNotifications(marta.id, { db });
    expect(martaNotifsAfter.unreadCount).toBe(0);
    expect(martaNotifsAfter.items[0]?.pendingFriendshipId).toBeNull();

    const adminNotifs = await listUserNotifications(admin.id, { db });
    expect(adminNotifs.unreadCount).toBe(1);
    expect(adminNotifs.items[0]?.type).toBe("FRIEND_REQUEST_ACCEPTED");

    const overview = await listFriendsOverview(admin.id, db);
    expect(overview.friends.map((f) => f.username)).toEqual(["carlos_pt", "marta_gz"]);

    // Unfriend revokes access immediately
    await removeOrRejectFriendship(admin.id, { targetUserId: carlos.id }, db);
    const overviewAfter = await listFriendsOverview(admin.id, db);
    expect(overviewAfter.friends.map((f) => f.username)).toEqual(["marta_gz"]);

    await removeOwnAvatar(marta.id, { db, mediaDir });
    const selfView = await getUserProfileByUsername(marta.id, "marta_gz", db);
    expect(selfView?.user.avatarPath).toBeNull();
  });

  it("enforces granular category privacy retroactively across profile, feed, and ArtistDrawer", async () => {
    const alice = await seedUser("alice");
    const bob = await seedUser("bob");

    await sendFriendRequest(alice.id, { targetUserId: bob.id }, { db });
    await acceptFriendRequest(bob.id, { targetUserId: alice.id }, db);

    const edition = await createFestival(
      { name: "Primavera Sound", year: 2027, location: "Barcelona" },
      alice.id,
      db,
    );
    await addEditionToUserFestivals(bob.id, edition.id, db);

    // Unrelated festival created by a third user that also books Kali Malone (Alice does NOT follow it)
    const stranger = await seedUser("stranger_org");
    const otherEdition = await createFestival(
      { name: "Unfollowed Fest", year: 2029, location: "Berlin" },
      stranger.id,
      db,
    );
    await importFestivalLineup(
      {
        festivalId: otherEdition.id,
        rows: [
          {
            billingName: "Kali Malone",
            artistNames: ["Kali Malone"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false, actorUserId: stranger.id },
    );

    await importFestivalLineup(
      {
        festivalId: edition.id,
        rows: [
          {
            billingName: "Kali Malone",
            artistNames: ["Kali Malone"],
            subtitle: null,
            day: "Viernes",
            stage: "Auditori",
            setTime: "21:00",
            included: true,
          },
          {
            billingName: "Tim Hecker",
            artistNames: ["Tim Hecker"],
            subtitle: null,
            day: "Sábado",
            stage: "Warehouse",
            setTime: "23:30",
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
    const kaliArtistId = kaliEntry?.artists[0]?.artist.id ?? "";
    const timArtistId = timEntry?.artists[0]?.artist.id ?? "";

    // Alice rates + notes Kali Malone, writes note-only on Tim Hecker, and adds live review on Kali
    await updateArtistRating(alice.id, { artistId: kaliArtistId, rating: 5 }, db);
    await updateArtistNotes(
      alice.id,
      { artistId: kaliArtistId, notes: "Órgano hipnótico imprescindible" },
      db,
    );
    await updateArtistNotes(
      alice.id,
      { artistId: timArtistId, notes: "Apunte privado sin puntuación todavía" },
      db,
    );
    await updateEntrySchedule(
      alice.id,
      {
        entryId: kaliEntry?.id ?? "",
        liveRating: 4,
        liveNotes: "Sonido brutal en el Auditori",
      },
      db,
    );

    // 1. Default (all FRIENDS): Bob sees festivals, shared festivals, scores, and live reviews,
    //    but personal artist notes are ALWAYS strictly private and never exposed to friends.
    const viewAllOpen = await getUserProfileByUsername(bob.id, "alice", db);
    expect(viewAllOpen?.sharedFestivals).toHaveLength(1);
    expect(viewAllOpen?.festivals).toHaveLength(1);
    expect(viewAllOpen?.posts).toHaveLength(3);
    expect(viewAllOpen?.posts.some((p) => p.artist?.id === timArtistId)).toBe(false);
    const aliceArtistPost = viewAllOpen?.posts.find(
      (p) => p.kind === "ARTIST_REVIEW" && p.artist?.id === kaliArtistId,
    );
    expect(aliceArtistPost?.festival?.name).toBe("Primavera Sound");
    expect(aliceArtistPost?.rating).toBe(5);
    expect(aliceArtistPost?.notes).toBeNull();

    const kaliDetailOpen = await getArtistDetail(bob.id, kaliArtistId, db);
    expect(kaliDetailOpen?.friendReviews).toHaveLength(1);
    expect(kaliDetailOpen?.friendReviews[0]?.rating).toBe(5);
    expect(kaliDetailOpen?.friendReviews[0]?.notes).toBeNull();
    expect(kaliDetailOpen?.friendReviews[0]?.liveRating).toBe(4);
    expect(kaliDetailOpen?.friendReviews[0]?.liveNotes).toBe("Sonido brutal en el Auditori");

    // 2. Alice sets notesVisibility = PRIVATE (keeps ratingsVisibility = FRIENDS)
    //    Live review comments are now hidden too, while numeric ratings remain visible.
    await updateOwnPrivacy(alice.id, { notesVisibility: "PRIVATE" }, db);

    const feedNoNotes = await listFriendsActivityFeed(bob.id, { db });
    expect(feedNoNotes.some((p) => p.artist?.id === timArtistId)).toBe(false);
    const kaliFeedPost = feedNoNotes.find(
      (p) => p.kind === "ARTIST_REVIEW" && p.artist?.id === kaliArtistId,
    );
    expect(kaliFeedPost?.rating).toBe(5);
    expect(kaliFeedPost?.notes).toBeNull();

    const kaliLivePostNoNotes = feedNoNotes.find((p) => p.kind === "LIVE_REVIEW");
    expect(kaliLivePostNoNotes?.rating).toBe(4);
    expect(kaliLivePostNoNotes?.notes).toBeNull();

    const kaliDetailNoNotes = await getArtistDetail(bob.id, kaliArtistId, db);
    expect(kaliDetailNoNotes?.friendReviews[0]?.rating).toBe(5);
    expect(kaliDetailNoNotes?.friendReviews[0]?.notes).toBeNull();
    expect(kaliDetailNoNotes?.friendReviews[0]?.liveRating).toBe(4);
    expect(kaliDetailNoNotes?.friendReviews[0]?.liveNotes).toBeNull();

    // 2b. Alice sets festivalsVisibility = PRIVATE (keeping ratingsVisibility = FRIENDS)
    // Live review still shows rating, but MUST NOT leak festival name/slug/day/stage!
    await updateOwnPrivacy(alice.id, { festivalsVisibility: "PRIVATE" }, db);
    const feedNoFestivals = await listFriendsActivityFeed(bob.id, { db });
    expect(feedNoFestivals.some((p) => p.kind === "FESTIVAL_ADDED")).toBe(false);
    const kaliLiveNoFest = feedNoFestivals.find((p) => p.kind === "LIVE_REVIEW");
    expect(kaliLiveNoFest?.rating).toBe(4);
    expect(kaliLiveNoFest?.festival).toBeNull();
    expect(kaliLiveNoFest?.entry?.day).toBeNull();
    expect(kaliLiveNoFest?.entry?.stage).toBeNull();

    // 3. Alice sets ratingsVisibility = PRIVATE as well (100% private)
    await updateOwnPrivacy(alice.id, { ratingsVisibility: "PRIVATE" }, db);

    const viewLocked = await getUserProfileByUsername(bob.id, "alice", db);
    expect(viewLocked?.canViewFestivals).toBe(false);
    expect(viewLocked?.canViewActivity).toBe(false);
    expect(viewLocked?.festivals).toHaveLength(0);
    expect(viewLocked?.sharedFestivals).toHaveLength(0);
    expect(viewLocked?.posts).toHaveLength(0);

    const feedLocked = await listFriendsActivityFeed(bob.id, { db });
    expect(feedLocked).toHaveLength(0);

    const kaliDetailLocked = await getArtistDetail(bob.id, kaliArtistId, db);
    expect(kaliDetailLocked?.friendReviews).toHaveLength(0);

    // Self still sees everything on her own profile
    const aliceSelfView = await getUserProfileByUsername(alice.id, "alice", db);
    expect(aliceSelfView?.festivals).toHaveLength(1);
    expect(aliceSelfView?.posts.length).toBeGreaterThanOrEqual(4);
  });

  it("delivers and coalesces festival update and friend-coincidence notifications", async () => {
    const admin = await seedUser("curator");
    const fan1 = await seedUser("fan_one");
    const fan2 = await seedUser("fan_two");

    await sendFriendRequest(fan1.id, { targetUserId: fan2.id }, { db });
    await acceptFriendRequest(fan2.id, { targetUserId: fan1.id }, db);
    await markAllNotificationsRead(fan1.id, db);
    await markAllNotificationsRead(fan2.id, db);

    const edition = await createFestival(
      { name: "Sónar", year: 2027, location: "Barcelona" },
      admin.id,
      db,
    );
    await addEditionToUserFestivals(fan1.id, edition.id, db);

    // fan2 joins the same festival -> fan1 gets FRIEND_JOINED_FESTIVAL!
    await addEditionToUserFestivals(fan2.id, edition.id, db);
    const fan1AfterJoin = await listUserNotifications(fan1.id, { db });
    expect(fan1AfterJoin.unreadCount).toBe(1);
    expect(fan1AfterJoin.items[0]?.type).toBe("FRIEND_JOINED_FESTIVAL");
    expect(fan1AfterJoin.items[0]?.payload.actorUsername).toBe("fan_two");

    // Admin imports two batches while fan2 hasn't read notifications -> coalesced into 1 unread item!
    await importFestivalLineup(
      {
        festivalId: edition.id,
        rows: [
          {
            billingName: "Autechre",
            artistNames: ["Autechre"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false, actorUserId: admin.id },
    );

    await importFestivalLineup(
      {
        festivalId: edition.id,
        rows: [
          {
            billingName: "Oneohtrix Point Never",
            artistNames: ["Oneohtrix Point Never"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
          {
            billingName: "Caterina Barbieri",
            artistNames: ["Caterina Barbieri"],
            subtitle: null,
            day: null,
            stage: null,
            setTime: null,
            included: true,
          },
        ],
      },
      { db, enqueueSync: false, actorUserId: admin.id },
    );

    // Admin (the actor) was not self-notified
    const adminNotifs = await listUserNotifications(admin.id, { db });
    expect(adminNotifs.items).toHaveLength(0);

    // fan2 has exactly 1 coalesced FESTIVAL_LINEUP_UPDATED with addedCount = 3
    const fan2Notifs = await listUserNotifications(fan2.id, { db });
    expect(fan2Notifs.unreadCount).toBe(1);
    expect(fan2Notifs.items[0]?.type).toBe("FESTIVAL_LINEUP_UPDATED");
    expect(fan2Notifs.items[0]?.payload.addedCount).toBe(3);

    // Updating festival dates triggers FESTIVAL_METADATA_UPDATED for followers
    await updateFestival(
      {
        festivalId: edition.id,
        name: "Sónar",
        year: 2027,
        location: "Barcelona",
        startDate: new Date("2027-06-17T00:00:00.000Z"),
        endDate: new Date("2027-06-19T00:00:00.000Z"),
      },
      db,
      { actorUserId: admin.id },
    );

    const fan2AfterMeta = await listUserNotifications(fan2.id, { db });
    expect(fan2AfterMeta.unreadCount).toBe(2);
    expect(fan2AfterMeta.items.some((n) => n.type === "FESTIVAL_METADATA_UPDATED")).toBe(true);

    // Mark single notification read, then mark all read
    const firstId = fan2AfterMeta.items[0]?.id ?? "";
    await markNotificationRead(fan2.id, { notificationId: firstId }, db);
    const afterSingle = await listUserNotifications(fan2.id, { db });
    expect(afterSingle.unreadCount).toBe(1);

    await markAllNotificationsRead(fan2.id, db);
    const afterAll = await listUserNotifications(fan2.id, { db });
    expect(afterAll.unreadCount).toBe(0);
  });
});
