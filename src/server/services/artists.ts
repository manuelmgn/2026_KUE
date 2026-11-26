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
      select: { status: true },
    }),
  ]);

  if (!artist) {
    throw new DomainError("Artista no encontrado");
  }

  const nextStatus = resolveStatusOnRating(existingState?.status ?? "PENDING", input.rating);
  const updated = await db.userArtistState.upsert({
    where: { userId_artistId: { userId, artistId: input.artistId } },
    create: {
      userId,
      artistId: input.artistId,
      rating: input.rating,
      status: nextStatus,
    },
    update: {
      rating: input.rating,
      status: nextStatus,
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
      notes: input.notes,
    },
    update: { notes: input.notes },
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
