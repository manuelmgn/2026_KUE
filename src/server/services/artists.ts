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

export async function getArtistDetail(artistId: string, db: PrismaClient = getDb()) {
  const artist = await db.artist.findUnique({
    where: { id: artistId },
    include: {
      albums: true,
      entries: {
        include: {
          entry: {
            include: {
              festival: true,
            },
          },
        },
      },
    },
  });

  if (!artist) {
    return null;
  }

  return {
    ...artist,
    albums: sortAlbumsForShelf(artist.albums),
    festivals: artist.entries
      .map((link) => ({
        entryId: link.entry.id,
        festivalId: link.entry.festival.id,
        festivalSlug: link.entry.festival.slug,
        festivalName: link.entry.festival.name,
        festivalYear: link.entry.festival.year,
        billingName: link.entry.billingName,
        subtitle: link.entry.subtitle,
        day: link.entry.day,
        stage: link.entry.stage,
        setTime: link.entry.setTime,
        liveRating: link.entry.liveRating,
        liveNotes: link.entry.liveNotes,
      }))
      .sort((a, b) => b.festivalYear - a.festivalYear),
  };
}

export async function updateArtistRating(
  rawInput: UpdateArtistRatingInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistRatingSchema.parse(rawInput);
  const existing = await db.artist.findUnique({
    where: { id: input.artistId },
    select: { status: true },
  });

  if (!existing) {
    throw new DomainError("Artista no encontrado");
  }

  const nextStatus = resolveStatusOnRating(existing.status, input.rating);
  return db.artist.update({
    where: { id: input.artistId },
    data: {
      rating: input.rating,
      status: nextStatus,
    },
  });
}

export async function updateArtistStatus(
  rawInput: UpdateArtistStatusInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistStatusSchema.parse(rawInput);
  return db.artist.update({
    where: { id: input.artistId },
    data: { status: input.status },
  });
}

export async function updateArtistNotes(
  rawInput: UpdateArtistNotesInput,
  db: PrismaClient = getDb(),
) {
  const input = updateArtistNotesSchema.parse(rawInput);
  return db.artist.update({
    where: { id: input.artistId },
    data: { notes: input.notes },
  });
}

export async function updateAlbumPin(rawInput: UpdateAlbumPinInput, db: PrismaClient = getDb()) {
  const input = updateAlbumPinSchema.parse(rawInput);
  return db.album.update({
    where: { id: input.albumId },
    data: { isPinned: input.isPinned },
  });
}

export async function updateAlbumCustomUrl(
  rawInput: UpdateAlbumCustomUrlInput,
  db: PrismaClient = getDb(),
) {
  const input = updateAlbumCustomUrlSchema.parse(rawInput);
  return db.album.update({
    where: { id: input.albumId },
    data: {
      customUrl: input.customUrl && input.customUrl.length > 0 ? input.customUrl : null,
    },
  });
}

/**
 * Updates MusicBrainz MBID & country while preserving rating, status, notes, and festival links.
 * Clears unpinned/non-custom albums from the wrong artist, removes their stale media files,
 * and enqueues an immediate re-sync (even if the artist is currently being synced).
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
        isPinned: false,
        customUrl: null,
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
