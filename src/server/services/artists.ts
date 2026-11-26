import type { FriendArtistReviewDTO } from "@/components/features/types";
import { DomainError } from "@/domain/errors";
import { resolveStatusOnRating, sortAlbumsForShelf } from "@/domain/rating";
import {
  type DisambiguateArtistInput,
  disambiguateArtistSchema,
  type UpdateAlbumCustomUrlInput,
  type UpdateAlbumPinInput,
  type UpdateArtistNotesInput,
  type UpdateArtistRatingInput,
  type UpdateArtistStatusInput,
  updateAlbumCustomUrlSchema,
  updateAlbumPinSchema,
  updateArtistNotesSchema,
  updateArtistRatingSchema,
  updateArtistStatusSchema,
} from "@/domain/schemas";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { deleteMediaFile } from "@/server/media-storage";
import { getAcceptedFriendIds } from "@/server/services/friends";
import { getSyncQueue, type SyncQueue } from "@/server/sync/queue";

export async function getArtistDetail(
  userId: string,
  artistId: string,
  db: PrismaClient = getDb(),
) {
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    include: {
      userStates: {
        where: { userId },
        take: 1,
      },
      albums: {
        include: {
          userStates: {
            where: { userId },
            take: 1,
          },
        },
      },
      entries: {
        include: {
          entry: {
            include: {
              edition: {
                include: {
                  festival: { select: { name: true } },
                },
              },
              userStates: {
                where: { userId },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!artist) {
    return null;
  }

  const state = artist.userStates[0];
  const hydratedAlbums = artist.albums.map((album) => {
    const albumState = album.userStates[0];
    return {
      id: album.id,
      title: album.title,
      releaseYear: album.releaseYear,
      releaseType: album.releaseType,
      coverPath: album.coverPath,
      isPinned: albumState?.isPinned ?? false,
      customUrl: albumState?.customUrl ?? null,
    };
  });

  const friendIds = await getAcceptedFriendIds(userId, db);
  let friendReviews: FriendArtistReviewDTO[] = [];

  if (friendIds.length > 0) {
    const entryIds = artist.entries.map((e) => e.entry.id);
    const [friendUsers, friendArtistStates, friendEntryStates] = await Promise.all([
      db.user.findMany({
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
      }),
      db.userArtistState.findMany({
        where: {
          artistId: artist.id,
          userId: { in: friendIds },
          rating: { not: null },
        },
      }),
      entryIds.length > 0
        ? db.userEntryState.findMany({
            where: {
              entryId: { in: entryIds },
              userId: { in: friendIds },
              OR: [{ liveRating: { not: null } }, { liveNotes: { not: "" } }],
            },
            orderBy: { updatedAt: "desc" },
            include: {
              entry: {
                select: {
                  edition: {
                    select: {
                      year: true,
                      festival: { select: { name: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const stateByFriend = new Map(friendArtistStates.map((s) => [s.userId, s]));
    const liveByFriend = new Map<string, (typeof friendEntryStates)[number]>();
    for (const ls of friendEntryStates) {
      if (!liveByFriend.has(ls.userId)) {
        liveByFriend.set(ls.userId, ls);
      }
    }

    for (const friend of friendUsers) {
      const aState = stateByFriend.get(friend.id);
      const lState = liveByFriend.get(friend.id);
      if (!aState && !lState) continue;

      const canSeeRatings = friend.ratingsVisibility === "FRIENDS";
      const canSeeNotes = friend.notesVisibility === "FRIENDS";

      const rating = canSeeRatings ? (aState?.rating ?? null) : null;
      // Personal artist notes are always strictly private and never exposed to friends.
      const notes = null;

      const liveRating = canSeeRatings ? (lState?.liveRating ?? null) : null;
      const rawLiveNotes = lState?.liveNotes.trim() ?? "";
      const liveNotes = canSeeNotes && rawLiveNotes.length > 0 ? rawLiveNotes : null;

      if (rating === null && liveRating === null && liveNotes === null) {
        continue;
      }

      const canSeeFest = friend.festivalsVisibility === "FRIENDS";
      const updatedAtDate =
        aState && lState
          ? new Date(Math.max(aState.updatedAt.getTime(), lState.updatedAt.getTime()))
          : (aState?.updatedAt ?? lState?.updatedAt ?? new Date(0));

      friendReviews.push({
        userId: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatarPath: friend.avatarPath,
        rating,
        notes,
        liveRating,
        liveNotes,
        festivalName: canSeeFest && lState ? lState.entry.edition.festival.name : null,
        festivalYear: canSeeFest && lState ? lState.entry.edition.year : null,
        updatedAt: updatedAtDate.toISOString(),
      });
    }

    friendReviews = friendReviews.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  }

  return {
    id: artist.id,
    name: artist.name,
    mbid: artist.mbid,
    country: artist.country,
    bio: artist.bio,
    imagePath: artist.imagePath,
    rating: state?.rating ?? null,
    status: state?.status ?? ("PENDING" as const),
    notes: state?.notes ?? "",
    syncStatus: artist.syncStatus,
    syncError: artist.syncError,
    albums: sortAlbumsForShelf(hydratedAlbums),
    festivals: artist.entries
      .map((link) => {
        const entryState = link.entry.userStates[0];
        return {
          entryId: link.entry.id,
          festivalId: link.entry.edition.id,
          festivalSlug: link.entry.edition.slug,
          festivalName: link.entry.edition.festival.name,
          festivalYear: link.entry.edition.year,
          billingName: link.entry.billingName,
          subtitle: link.entry.subtitle,
          day: link.entry.day,
          stage: link.entry.stage,
          setTime: link.entry.setTime,
          liveRating: entryState?.liveRating ?? null,
          liveNotes: entryState?.liveNotes ?? "",
        };
      })
      .sort((a, b) => b.festivalYear - a.festivalYear),
    friendReviews,
  };
}

export async function updateArtistRating(
  userId: string,
  rawInput: UpdateArtistRatingInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistRatingSchema.parse(rawInput);
  const [artist, existingState] = await Promise.all([
    db.artist.findUnique({ where: { id: input.artistId }, select: { id: true } }),
    db.userArtistState.findUnique({
      where: { userId_artistId: { userId, artistId: input.artistId } },
      select: { status: true, notes: true, ratedAt: true },
    }),
  ]);

  if (!artist) {
    throw new DomainError("Artista no encontrado");
  }

  const nextStatus = resolveStatusOnRating(existingState?.status ?? "PENDING", input.rating);
  const nextRatedAt =
    input.rating !== null ? new Date() : existingState?.notes.trim() ? existingState.ratedAt : null;

  const updated = await db.userArtistState.upsert({
    where: { userId_artistId: { userId, artistId: input.artistId } },
    create: {
      userId,
      artistId: input.artistId,
      rating: input.rating,
      status: nextStatus,
      ratedAt: nextRatedAt,
    },
    update: {
      rating: input.rating,
      status: nextStatus,
      ratedAt: nextRatedAt,
    },
  });

  return { id: input.artistId, rating: updated.rating, status: updated.status };
}

export async function updateArtistStatus(
  userId: string,
  rawInput: UpdateArtistStatusInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistStatusSchema.parse(rawInput);
  const artist = await db.artist.findUnique({
    where: { id: input.artistId },
    select: { id: true },
  });
  if (!artist) {
    throw new DomainError("Artista no encontrado");
  }

  const updated = await db.userArtistState.upsert({
    where: { userId_artistId: { userId, artistId: input.artistId } },
    create: {
      userId,
      artistId: input.artistId,
      status: input.status,
    },
    update: { status: input.status },
  });

  return { id: input.artistId, status: updated.status };
}

export async function updateArtistNotes(
  userId: string,
  rawInput: UpdateArtistNotesInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistNotesSchema.parse(rawInput);
  const [artist, existingState] = await Promise.all([
    db.artist.findUnique({
      where: { id: input.artistId },
      select: { id: true },
    }),
    db.userArtistState.findUnique({
      where: { userId_artistId: { userId, artistId: input.artistId } },
      select: { rating: true, ratedAt: true },
    }),
  ]);
  if (!artist) {
    throw new DomainError("Artista no encontrado");
  }

  const hasText = input.notes.trim().length > 0;
  const nextRatedAt = hasText
    ? new Date()
    : existingState?.rating !== null && existingState?.rating !== undefined
      ? existingState.ratedAt
      : null;

  const updated = await db.userArtistState.upsert({
    where: { userId_artistId: { userId, artistId: input.artistId } },
    create: {
      userId,
      artistId: input.artistId,
      notes: input.notes,
      ratedAt: nextRatedAt,
    },
    update: {
      notes: input.notes,
      ratedAt: nextRatedAt,
    },
  });

  return { id: input.artistId, notes: updated.notes };
}

export async function updateAlbumPin(
  userId: string,
  rawInput: UpdateAlbumPinInput,
  db: PrismaClient = getDb(),
) {
  const input = updateAlbumPinSchema.parse(rawInput);
  const album = await db.album.findUnique({
    where: { id: input.albumId },
    select: { id: true },
  });
  if (!album) {
    throw new DomainError("Álbum no encontrado");
  }

  const updated = await db.userAlbumState.upsert({
    where: { userId_albumId: { userId, albumId: input.albumId } },
    create: {
      userId,
      albumId: input.albumId,
      isPinned: input.isPinned,
    },
    update: { isPinned: input.isPinned },
  });

  return { id: input.albumId, isPinned: updated.isPinned };
}

export async function updateAlbumCustomUrl(
  userId: string,
  rawInput: UpdateAlbumCustomUrlInput,
  db: PrismaClient = getDb(),
) {
  const input = updateAlbumCustomUrlSchema.parse(rawInput);
  const album = await db.album.findUnique({
    where: { id: input.albumId },
    select: { id: true },
  });
  if (!album) {
    throw new DomainError("Álbum no encontrado");
  }

  const cleaned = input.customUrl && input.customUrl.length > 0 ? input.customUrl : null;
  const updated = await db.userAlbumState.upsert({
    where: { userId_albumId: { userId, albumId: input.albumId } },
    create: {
      userId,
      albumId: input.albumId,
      customUrl: cleaned,
    },
    update: { customUrl: cleaned },
  });

  return { id: input.albumId, customUrl: updated.customUrl };
}

/**
 * Updates MusicBrainz MBID & country while preserving every user's rating, status, notes,
 * and festival links. Clears albums from the wrong artist unless any user pinned or customized them.
 */
export async function disambiguateArtist(
  rawInput: DisambiguateArtistInput,
  options: { db?: PrismaClient; queue?: SyncQueue; enqueueSync?: boolean; mediaDir?: string } = {},
) {
  const input = disambiguateArtistSchema.parse(rawInput);
  const db = options.db ?? getDb();
  const shouldEnqueue = options.enqueueSync ?? true;

  const { updated, staleMediaPaths } = await db.$transaction(async (tx) => {
    const existing = await tx.artist.findUnique({
      where: { id: input.artistId },
      select: { id: true, imagePath: true },
    });
    if (!existing) {
      throw new DomainError("Artista no encontrado");
    }

    const conflict = await tx.artist.findUnique({
      where: { mbid: input.mbid },
      select: { id: true, name: true },
    });
    if (conflict && conflict.id !== input.artistId) {
      throw new DomainError(
        `Este artista de MusicBrainz ya está vinculado a la ficha de «${conflict.name}».`,
      );
    }

    const albumsToDelete = await tx.album.findMany({
      where: {
        artistId: input.artistId,
        userStates: {
          none: {
            OR: [{ isPinned: true }, { customUrl: { not: null } }],
          },
        },
      },
      select: { id: true, coverPath: true },
    });

    if (albumsToDelete.length > 0) {
      await tx.album.deleteMany({
        where: { id: { in: albumsToDelete.map((album) => album.id) } },
      });
    }

    const artist = await tx.artist.update({
      where: { id: input.artistId },
      data: {
        mbid: input.mbid,
        country: input.country ?? null,
        bio: null,
        imagePath: null,
        deezerId: null,
        syncStatus: "PENDING",
        syncError: null,
        syncedAt: null,
      },
    });

    const paths = [existing.imagePath, ...albumsToDelete.map((album) => album.coverPath)].filter(
      (p): p is string => Boolean(p),
    );

    return { updated: artist, staleMediaPaths: paths };
  });

  if (staleMediaPaths.length > 0) {
    await Promise.all(staleMediaPaths.map((p) => deleteMediaFile(p, options.mediaDir)));
  }

  if (shouldEnqueue) {
    const queue = options.queue ?? getSyncQueue();
    queue.enqueue(updated.id, { rerunIfActive: true });
  }

  return updated;
}
