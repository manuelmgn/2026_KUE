import type {
  FestivalArchiveItemDTO,
  FestivalSummary,
  FriendRadarPickDTO,
  SharedFestivalMatchDTO,
  SocialPostItemDTO,
  UserPrivacySettingsDTO,
  UserProfileSummaryDTO,
  UserProfileViewDTO,
} from "@/components/features/types";
import { normalizeUsername } from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import {
  type UpdatePrivacyInput,
  type UpdateProfileInput,
  updatePrivacySchema,
  updateProfileSchema,
} from "@/domain/schemas";
import type { PrismaClient, VisibilityScope } from "@/generated/prisma/client";
import {
  getAvatarUploadRateLimiter,
  type SlidingWindowRateLimiter,
} from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { deleteMediaFile, processAndSaveAvatar } from "@/server/media-storage";
import { getAcceptedFriendIds, getRelationshipBetween } from "@/server/services/friends";
import { toFestivalSummary } from "@/server/services/mappers";

export interface OwnAccountProfileDTO {
  profile: UserProfileSummaryDTO;
  privacy: UserPrivacySettingsDTO;
}

export async function getOwnAccountProfileAndPrivacy(
  userId: string,
  db: PrismaClient = getDb(),
): Promise<OwnAccountProfileDTO> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      location: true,
      avatarPath: true,
      festivalsVisibility: true,
      ratingsVisibility: true,
      notesVisibility: true,
    },
  });

  if (!user) {
    throw new DomainError("Usuario no encontrado");
  }

  return {
    profile: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      location: user.location,
      avatarPath: user.avatarPath,
    },
    privacy: {
      festivalsVisibility: user.festivalsVisibility,
      ratingsVisibility: user.ratingsVisibility,
      notesVisibility: user.notesVisibility,
    },
  };
}

export async function updateOwnProfile(
  userId: string,
  rawInput: UpdateProfileInput,
  db: PrismaClient = getDb(),
): Promise<UserProfileSummaryDTO> {
  const input = updateProfileSchema.parse(rawInput);

  const data: {
    displayName?: string | null;
    bio?: string;
    location?: string | null;
  } = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName && input.displayName.length > 0 ? input.displayName : null;
  }
  if (input.bio !== undefined) {
    data.bio = input.bio;
  }
  if (input.location !== undefined) {
    data.location = input.location && input.location.length > 0 ? input.location : null;
  }

  const updated = await db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      location: true,
      avatarPath: true,
    },
  });

  return updated;
}

export async function updateOwnPrivacy(
  userId: string,
  rawInput: UpdatePrivacyInput,
  db: PrismaClient = getDb(),
): Promise<UserPrivacySettingsDTO> {
  const input = updatePrivacySchema.parse(rawInput);

  const data: {
    festivalsVisibility?: VisibilityScope;
    ratingsVisibility?: VisibilityScope;
    notesVisibility?: VisibilityScope;
  } = {};

  if (input.festivalsVisibility !== undefined) {
    data.festivalsVisibility = input.festivalsVisibility;
  }
  if (input.ratingsVisibility !== undefined) {
    data.ratingsVisibility = input.ratingsVisibility;
  }
  if (input.notesVisibility !== undefined) {
    data.notesVisibility = input.notesVisibility;
  }

  const updated = await db.user.update({
    where: { id: userId },
    data,
    select: {
      festivalsVisibility: true,
      ratingsVisibility: true,
      notesVisibility: true,
    },
  });

  return updated;
}

export async function uploadOwnAvatar(
  userId: string,
  buffer: Buffer,
  options: {
    ipAddress?: string | null;
    db?: PrismaClient;
    mediaDir?: string;
    rateLimiter?: SlidingWindowRateLimiter;
  } = {},
): Promise<{ avatarPath: string }> {
  const db = options.db ?? getDb();
  const limiter = options.rateLimiter ?? getAvatarUploadRateLimiter();
  const limitKey = `avatar:${userId}:${options.ipAddress ?? "local"}`;

  const check = limiter.check(limitKey);
  if (!check.allowed) {
    throw new DomainError(
      `Demasiados cambios de avatar seguidos. Espera ${Math.ceil(check.retryAfterSeconds / 60)} min.`,
    );
  }

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, avatarPath: true },
  });
  if (!existing) {
    throw new DomainError("Usuario no encontrado");
  }

  const avatarPath = await processAndSaveAvatar({
    buffer,
    userId,
    previousAvatarPath: existing.avatarPath,
    ...(options.mediaDir !== undefined ? { mediaDir: options.mediaDir } : {}),
  });

  await db.user.update({
    where: { id: userId },
    data: { avatarPath },
  });

  limiter.record(limitKey);
  return { avatarPath };
}

export async function removeOwnAvatar(
  userId: string,
  options: { db?: PrismaClient; mediaDir?: string } = {},
): Promise<void> {
  const db = options.db ?? getDb();
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, avatarPath: true },
  });
  if (!existing) {
    throw new DomainError("Usuario no encontrado");
  }

  if (existing.avatarPath) {
    await db.user.update({
      where: { id: userId },
      data: { avatarPath: null },
    });
    await deleteMediaFile(existing.avatarPath, options.mediaDir);
  }
}

interface TargetAuthorMeta {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  festivalsVisibility: VisibilityScope;
  ratingsVisibility: VisibilityScope;
  notesVisibility: VisibilityScope;
}

async function collectPostsForAuthors(
  authors: TargetAuthorMeta[],
  options: { viewerId: string; limit: number; db: PrismaClient },
): Promise<SocialPostItemDTO[]> {
  if (authors.length === 0) {
    return [];
  }

  const { viewerId, limit, db } = options;
  const authorById = new Map(authors.map((a) => [a.id, a]));

  // Personal artist notes and live comments are ALWAYS strictly private.
  // Social feed only exposes numeric ratings (both studio and live).
  const artistReviewAuthorIds = authors
    .filter((a) => a.id === viewerId || a.ratingsVisibility === "FRIENDS")
    .map((a) => a.id);

  const liveReviewAuthorIds = authors
    .filter((a) => a.id === viewerId || a.ratingsVisibility === "FRIENDS")
    .map((a) => a.id);

  // Determine which authors allow festivals
  const festivalAuthorIds = authors
    .filter((a) => a.id === viewerId || a.festivalsVisibility === "FRIENDS")
    .map((a) => a.id);

  const [artistStates, entryStates, editionFollows, authorMemberships] = await Promise.all([
    artistReviewAuthorIds.length > 0
      ? db.userArtistState.findMany({
          where: {
            userId: { in: artistReviewAuthorIds },
            rating: { not: null },
          },
          orderBy: [{ ratedAt: "desc" }, { updatedAt: "desc" }],
          take: limit * 2,
          include: {
            artist: {
              select: {
                id: true,
                name: true,
                imagePath: true,
                entries: {
                  orderBy: { entry: { edition: { year: "desc" } } },
                  include: {
                    entry: {
                      include: {
                        edition: {
                          include: {
                            festival: { select: { slug: true, name: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    liveReviewAuthorIds.length > 0
      ? db.userEntryState.findMany({
          where: {
            userId: { in: liveReviewAuthorIds },
            liveRating: { not: null },
          },
          orderBy: [{ updatedAt: "desc" }],
          take: limit * 2,
          include: {
            entry: {
              select: {
                id: true,
                billingName: true,
                day: true,
                stage: true,
                artists: {
                  orderBy: { position: "asc" },
                  take: 1,
                  include: {
                    artist: { select: { id: true, name: true, imagePath: true } },
                  },
                },
                edition: {
                  select: {
                    id: true,
                    slug: true,
                    year: true,
                    location: true,
                    festival: { select: { slug: true, name: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    festivalAuthorIds.length > 0
      ? db.userFestivalEdition.findMany({
          where: { userId: { in: festivalAuthorIds } },
          orderBy: [{ addedAt: "desc" }],
          take: limit * 2,
          include: {
            edition: {
              select: {
                id: true,
                slug: true,
                year: true,
                location: true,
                festival: { select: { slug: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    festivalAuthorIds.length > 0
      ? db.userFestivalEdition.findMany({
          where: { userId: { in: festivalAuthorIds } },
          select: { userId: true, editionId: true },
        })
      : Promise.resolve([]),
  ]);

  // Fetch pre-concert studio ratings for live reviews so the feed can show pre → post evolution
  const liveArtistIds = Array.from(
    new Set(
      entryStates
        .map((s) => s.entry.artists[0]?.artist.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const preRatingByUserArtist = new Map<string, number>();
  if (liveArtistIds.length > 0 && liveReviewAuthorIds.length > 0) {
    const preStates = await db.userArtistState.findMany({
      where: {
        userId: { in: liveReviewAuthorIds },
        artistId: { in: liveArtistIds },
        rating: { not: null },
      },
      select: { userId: true, artistId: true, rating: true },
    });
    for (const ps of preStates) {
      if (ps.rating !== null) {
        preRatingByUserArtist.set(`${ps.userId}:${ps.artistId}`, ps.rating);
      }
    }
  }

  const followedEditionsByUser = new Map<string, Set<string>>();
  for (const m of authorMemberships) {
    let set = followedEditionsByUser.get(m.userId);
    if (!set) {
      set = new Set();
      followedEditionsByUser.set(m.userId, set);
    }
    set.add(m.editionId);
  }

  const posts: SocialPostItemDTO[] = [];

  for (const state of artistStates) {
    const author = authorById.get(state.userId);
    if (!author) continue;
    const isSelf = author.id === viewerId;
    const canSeeRatings = isSelf || author.ratingsVisibility === "FRIENDS";

    const visibleRating = canSeeRatings ? state.rating : null;
    if (visibleRating === null) {
      continue;
    }

    const canSeeFestivals = isSelf || author.festivalsVisibility === "FRIENDS";
    const authorSet = followedEditionsByUser.get(author.id);
    const linkedEdition = canSeeFestivals
      ? state.artist.entries.find((link) => authorSet?.has(link.entry.edition.id))?.entry.edition
      : undefined;

    posts.push({
      id: `artist:${state.userId}:${state.artistId}`,
      kind: "ARTIST_REVIEW",
      createdAt: (state.ratedAt ?? state.updatedAt).toISOString(),
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarPath: author.avatarPath,
      },
      artist: {
        id: state.artist.id,
        name: state.artist.name,
        imagePath: state.artist.imagePath,
        ...(canSeeRatings ? { status: state.status } : {}),
      },
      festival: linkedEdition
        ? {
            id: linkedEdition.id,
            slug: linkedEdition.slug,
            brandSlug: linkedEdition.festival.slug,
            name: linkedEdition.festival.name,
            year: linkedEdition.year,
            location: linkedEdition.location,
          }
        : null,
      entry: null,
      rating: visibleRating,
      notes: null,
    });
  }

  for (const state of entryStates) {
    const author = authorById.get(state.userId);
    if (!author) continue;
    const isSelf = author.id === viewerId;
    const canSeeRatings = isSelf || author.ratingsVisibility === "FRIENDS";

    const visibleRating = canSeeRatings ? state.liveRating : null;
    if (visibleRating === null) {
      continue;
    }

    const canSeeFestivals = isSelf || author.festivalsVisibility === "FRIENDS";
    const firstArtist = state.entry.artists[0]?.artist ?? null;
    const ed = state.entry.edition;
    const preRating =
      firstArtist && canSeeRatings
        ? (preRatingByUserArtist.get(`${state.userId}:${firstArtist.id}`) ?? null)
        : null;

    posts.push({
      id: `live:${state.userId}:${state.entryId}`,
      kind: "LIVE_REVIEW",
      createdAt: state.updatedAt.toISOString(),
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarPath: author.avatarPath,
      },
      artist: firstArtist
        ? {
            id: firstArtist.id,
            name: firstArtist.name,
            imagePath: firstArtist.imagePath,
          }
        : null,
      festival: canSeeFestivals
        ? {
            id: ed.id,
            slug: ed.slug,
            brandSlug: ed.festival.slug,
            name: ed.festival.name,
            year: ed.year,
            location: ed.location,
          }
        : null,
      entry: {
        id: state.entry.id,
        billingName: state.entry.billingName,
        day: canSeeFestivals ? state.entry.day : null,
        stage: canSeeFestivals ? state.entry.stage : null,
      },
      rating: visibleRating,
      preRating,
      notes: null,
    });
  }

  for (const follow of editionFollows) {
    const author = authorById.get(follow.userId);
    if (!author) continue;
    const ed = follow.edition;
    posts.push({
      id: `fest:${follow.userId}:${follow.editionId}`,
      kind: "FESTIVAL_ADDED",
      createdAt: follow.addedAt.toISOString(),
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarPath: author.avatarPath,
      },
      artist: null,
      festival: {
        id: ed.id,
        slug: ed.slug,
        brandSlug: ed.festival.slug,
        name: ed.festival.name,
        year: ed.year,
        location: ed.location,
      },
      entry: null,
      rating: null,
      notes: null,
    });
  }

  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return posts.slice(0, limit);
}

export async function getUserProfileByUsername(
  viewerId: string,
  rawUsername: string,
  db: PrismaClient = getDb(),
): Promise<UserProfileViewDTO | null> {
  let decoded = rawUsername;
  try {
    decoded = decodeURIComponent(rawUsername);
  } catch {
    // Keep raw if malformed percent encoding
  }
  const normalizedUsername = normalizeUsername(decoded.replace(/^@+/, ""));
  if (!normalizedUsername) {
    return null;
  }

  const target = await db.user.findUnique({
    where: { normalizedUsername },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      location: true,
      avatarPath: true,
      isActive: true,
      festivalsVisibility: true,
      ratingsVisibility: true,
      notesVisibility: true,
    },
  });

  if (!target?.isActive) {
    return null;
  }

  const rel = await getRelationshipBetween(viewerId, target.id, db);
  const isSelf = rel.status === "SELF";
  const isFriend = rel.status === "FRIENDS";

  const canViewFestivals = isSelf || (isFriend && target.festivalsVisibility === "FRIENDS");
  const canViewRatings = isSelf || (isFriend && target.ratingsVisibility === "FRIENDS");
  const canViewNotes = isSelf || (isFriend && target.notesVisibility === "FRIENDS");
  const canViewActivity =
    isSelf || (isFriend && (canViewFestivals || canViewRatings || canViewNotes));

  const [targetEditions, viewerData, posts, friendsIds] = await Promise.all([
    canViewFestivals
      ? db.festivalEdition.findMany({
          where: { followers: { some: { userId: target.id } } },
          include: {
            festival: { select: { id: true, slug: true, name: true } },
            _count: { select: { entries: true } },
          },
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    isFriend && canViewFestivals
      ? db.user.findUnique({
          where: { id: viewerId },
          select: {
            festivalsVisibility: true,
            editions: { select: { editionId: true } },
          },
        })
      : Promise.resolve(null),
    canViewActivity
      ? collectPostsForAuthors([target], { viewerId, limit: 40, db })
      : Promise.resolve([]),
    isSelf || isFriend ? getAcceptedFriendIds(target.id, db) : Promise.resolve(null),
  ]);

  const festivals: FestivalArchiveItemDTO[] = targetEditions.map((ed) => ({
    ...toFestivalSummary(ed),
    startDate: ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null,
    endDate: ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null,
    entriesCount: ed._count.entries,
  }));

  let sharedFestivals: FestivalSummary[] = [];
  if (isFriend && canViewFestivals && viewerData?.festivalsVisibility === "FRIENDS") {
    const viewerEditionSet = new Set(viewerData.editions.map((e) => e.editionId));
    sharedFestivals = targetEditions
      .filter((ed) => viewerEditionSet.has(ed.id))
      .map(toFestivalSummary);
  }

  return {
    user: {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      bio: target.bio,
      location: target.location,
      avatarPath: target.avatarPath,
    },
    relationship: rel.status,
    friendshipId: rel.friendshipId,
    privacy: isSelf
      ? {
          festivalsVisibility: target.festivalsVisibility,
          ratingsVisibility: target.ratingsVisibility,
          notesVisibility: target.notesVisibility,
        }
      : null,
    canViewFestivals,
    canViewRatings,
    canViewNotes,
    canViewActivity,
    sharedFestivals,
    festivals,
    posts,
    friendsCount: friendsIds !== null ? friendsIds.length : null,
  };
}

export async function listFriendsActivityFeed(
  viewerId: string,
  options: { limit?: number; db?: PrismaClient } = {},
): Promise<SocialPostItemDTO[]> {
  const db = options.db ?? getDb();
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);

  const friendIds = await getAcceptedFriendIds(viewerId, db);
  if (friendIds.length === 0) {
    return [];
  }

  const friends = await db.user.findMany({
    where: { id: { in: friendIds }, isActive: true },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarPath: true,
      festivalsVisibility: true,
      ratingsVisibility: true,
      notesVisibility: true,
    },
  });

  return collectPostsForAuthors(friends, { viewerId, limit, db });
}

export async function getSocialInsights(
  viewerId: string,
  db: PrismaClient = getDb(),
): Promise<{
  sharedFestivals: SharedFestivalMatchDTO[];
  radarPicks: FriendRadarPickDTO[];
  myEditionIds: string[];
}> {
  const [myMemberships, friendIds] = await Promise.all([
    db.userFestivalEdition.findMany({
      where: { userId: viewerId },
      include: {
        edition: {
          include: {
            festival: { select: { slug: true, name: true } },
            entries: {
              include: {
                artists: {
                  include: {
                    artist: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    getAcceptedFriendIds(viewerId, db),
  ]);

  const myEditionIds = myMemberships.map((m) => m.editionId);
  if (myEditionIds.length === 0 || friendIds.length === 0) {
    return { sharedFestivals: [], radarPicks: [], myEditionIds };
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingMemberships = myMemberships.filter((m) => {
    const ed = m.edition;
    const endIso = ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null;
    const startIso = ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null;
    if (endIso) return endIso >= todayIso;
    if (startIso) return startIso >= todayIso;
    return ed.year >= Number(todayIso.slice(0, 4));
  });
  const targetMemberships = upcomingMemberships.length > 0 ? upcomingMemberships : myMemberships;
  const targetEditionIds = targetMemberships.map((m) => m.editionId);

  const [friends, friendMemberships, myArtistStates] = await Promise.all([
    db.user.findMany({
      where: { id: { in: friendIds }, isActive: true },
      select: {
        id: true,
        username: true,
        festivalsVisibility: true,
        ratingsVisibility: true,
      },
    }),
    db.userFestivalEdition.findMany({
      where: {
        userId: { in: friendIds },
        editionId: { in: targetEditionIds },
      },
      select: { userId: true, editionId: true },
    }),
    db.userArtistState.findMany({
      where: { userId: viewerId },
      select: { artistId: true, rating: true, status: true },
    }),
  ]);

  const friendById = new Map(friends.map((f) => [f.id, f]));
  const myStateByArtist = new Map(myArtistStates.map((s) => [s.artistId, s]));

  // Collect all artist IDs across target editions
  const artistEditionMap = new Map<
    string,
    { artistName: string; edition: (typeof targetMemberships)[number]["edition"] }
  >();
  for (const m of targetMemberships) {
    for (const entry of m.edition.entries) {
      for (const link of entry.artists) {
        if (!artistEditionMap.has(link.artist.id)) {
          artistEditionMap.set(link.artist.id, {
            artistName: link.artist.name,
            edition: m.edition,
          });
        }
      }
    }
  }

  const allArtistIds = Array.from(artistEditionMap.keys());
  const ratingFriendlyIds = friends
    .filter((f) => f.ratingsVisibility === "FRIENDS")
    .map((f) => f.id);

  const friendRatings =
    allArtistIds.length > 0 && ratingFriendlyIds.length > 0
      ? await db.userArtistState.findMany({
          where: {
            userId: { in: ratingFriendlyIds },
            artistId: { in: allArtistIds },
            rating: { not: null },
          },
          select: { userId: true, artistId: true, rating: true },
        })
      : [];

  // 1. Shared Festivals
  const sharedFestivals: SharedFestivalMatchDTO[] = [];
  for (const m of targetMemberships) {
    const ed = m.edition;
    const sharedFriendIds = friendMemberships
      .filter((fm) => fm.editionId === ed.id)
      .map((fm) => fm.userId)
      .filter((fid) => friendById.get(fid)?.festivalsVisibility === "FRIENDS");

    if (sharedFriendIds.length === 0) continue;

    const edArtistIds = new Set<string>();
    for (const entry of ed.entries) {
      for (const link of entry.artists) {
        edArtistIds.add(link.artist.id);
      }
    }

    const participantIds = new Set([viewerId, ...sharedFriendIds]);
    const scores: number[] = [];
    for (const aId of edArtistIds) {
      const myR = myStateByArtist.get(aId)?.rating;
      if (myR != null) scores.push(myR);
    }
    for (const fr of friendRatings) {
      if (fr.rating !== null && participantIds.has(fr.userId) && edArtistIds.has(fr.artistId)) {
        scores.push(fr.rating);
      }
    }

    const averageRating =
      scores.length > 0
        ? Math.round((scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10) / 10
        : null;

    sharedFestivals.push({
      editionId: ed.id,
      slug: ed.slug,
      brandSlug: ed.festival.slug,
      name: ed.festival.name,
      year: ed.year,
      location: ed.location,
      friendUsernames: sharedFriendIds
        .map((fid) => friendById.get(fid)?.username)
        .filter((u): u is string => Boolean(u)),
      averageRating,
    });
  }

  // 2. Radar Picks (artists rated >= 4 by friends that current user still hasn't rated or discarded)
  const backersByArtist = new Map<string, Array<{ username: string; rating: number }>>();
  for (const fr of friendRatings) {
    if (fr.rating === null || fr.rating < 4) continue;
    const friend = friendById.get(fr.userId);
    if (!friend) continue;
    const myState = myStateByArtist.get(fr.artistId);
    if (myState && (myState.rating !== null || myState.status === "DISCARDED")) {
      continue;
    }
    const list = backersByArtist.get(fr.artistId) ?? [];
    list.push({ username: friend.username, rating: fr.rating });
    backersByArtist.set(fr.artistId, list);
  }

  const radarPicks: FriendRadarPickDTO[] = Array.from(backersByArtist.entries())
    .map(([artistId, backers]) => {
      const meta = artistEditionMap.get(artistId);
      if (!meta) return null;
      const myState = myStateByArtist.get(artistId);
      return {
        artistId,
        artistName: meta.artistName,
        editionId: meta.edition.id,
        festivalSlug: meta.edition.slug,
        festivalBrandSlug: meta.edition.festival.slug,
        festivalName: meta.edition.festival.name,
        festivalYear: meta.edition.year,
        yourStatus: myState?.status ?? ("PENDING" as const),
        backers: backers.sort((a, b) => b.rating - a.rating),
      };
    })
    .filter((p): p is FriendRadarPickDTO => p !== null)
    .sort((a, b) => b.backers.length - a.backers.length || a.artistName.localeCompare(b.artistName))
    .slice(0, 8);

  return { sharedFestivals, radarPicks, myEditionIds };
}
