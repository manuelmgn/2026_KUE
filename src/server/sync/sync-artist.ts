import type { Album, Artist, PrismaClient } from "@/generated/prisma/client";
import { searchDeezerAlbumCover, searchDeezerArtistPhoto } from "@/server/clients/deezer";
import {
  fetchMusicBrainzReleaseGroups,
  type NormalizedReleaseGroup,
  searchMusicBrainzArtists,
} from "@/server/clients/musicbrainz";
import { fetchWikipediaBio } from "@/server/clients/wikipedia";
import { getDb } from "@/server/db";
import { deleteMediaFile, downloadAndSaveMedia, type MediaBucket } from "@/server/media-storage";

export interface SyncArtistOptions {
  db?: PrismaClient;
  mediaDir?: string;
}

interface SyncContext {
  db: PrismaClient;
  mediaDir: string | undefined;
}

async function saveImage(
  ctx: SyncContext,
  url: string | null | undefined,
  bucket: MediaBucket,
  baseName: string,
): Promise<string | null> {
  if (!url) {
    return null;
  }
  return downloadAndSaveMedia({
    url,
    bucket,
    baseName,
    ...(ctx.mediaDir ? { mediaDir: ctx.mediaDir } : {}),
  });
}

/**
 * Finds the MusicBrainz identity for an artist without an MBID. Never steals an MBID that
 * another artist in the archive already owns (the unique constraint would reject it anyway).
 */
async function resolveIdentity(
  ctx: SyncContext,
  artist: Artist,
): Promise<{ mbid: string | null; country: string | null }> {
  if (artist.mbid) {
    return { mbid: artist.mbid, country: artist.country };
  }

  const [top] = await searchMusicBrainzArtists(artist.name, 5);
  if (!top) {
    return { mbid: null, country: artist.country };
  }

  const owner = await ctx.db.artist.findUnique({ where: { mbid: top.id }, select: { id: true } });
  const mbid = !owner || owner.id === artist.id ? top.id : null;
  return { mbid, country: mbid ? (top.country ?? artist.country) : artist.country };
}

async function isIdentityUnchanged(ctx: SyncContext, artistId: string, mbid: string | null) {
  const current = await ctx.db.artist.findUnique({
    where: { id: artistId },
    select: { mbid: true },
  });
  return current !== null && current.mbid === mbid;
}

/**
 * Upserts the fresh discography, downloads missing covers, and prunes stale releases that are
 * no longer part of the artist's shelf — unless the user pinned them or attached a custom URL.
 */
async function syncAlbums(
  ctx: SyncContext,
  artist: Pick<Artist, "id" | "name">,
  releaseGroups: ReadonlyArray<NormalizedReleaseGroup>,
): Promise<void> {
  const freshMbids = new Set(releaseGroups.map((rg) => rg.mbid));
  const existing = await ctx.db.album.findMany({ where: { artistId: artist.id } });

  const stale = existing.filter(
    (album: Album) =>
      (album.mbid === null || !freshMbids.has(album.mbid)) && !album.isPinned && !album.customUrl,
  );
  if (stale.length > 0) {
    await ctx.db.album.deleteMany({ where: { id: { in: stale.map((album) => album.id) } } });
    await Promise.all(stale.map((album) => deleteMediaFile(album.coverPath, ctx.mediaDir)));
  }

  for (const rg of releaseGroups) {
    const data = { title: rg.title, releaseYear: rg.releaseYear, releaseType: rg.releaseType };
    const album = await ctx.db.album.upsert({
      where: { artistId_mbid: { artistId: artist.id, mbid: rg.mbid } },
      update: data,
      create: { artistId: artist.id, mbid: rg.mbid, ...data },
    });

    if (album.coverPath) {
      continue;
    }

    const coverUrl = await searchDeezerAlbumCover(artist.name, rg.title);
    const savedCover = await saveImage(ctx, coverUrl, "albums", album.id);
    if (savedCover) {
      await ctx.db.album.update({ where: { id: album.id }, data: { coverPath: savedCover } });
    }
  }
}

/**
 * Enriches one artist: MusicBrainz identity + discography, Deezer photo/covers (cached in
 * MEDIA_DIR) and a short Wikipedia bio. MusicBrainz pacing is enforced by its client.
 *
 * If the artist's MBID changes concurrently (manual disambiguation while this job runs), the
 * job stops without writing stale data; the disambiguation re-queues a fresh run.
 */
export async function syncArtist(artistId: string, options: SyncArtistOptions = {}): Promise<void> {
  const ctx: SyncContext = { db: options.db ?? getDb(), mediaDir: options.mediaDir };

  const artist = await ctx.db.artist.findUnique({ where: { id: artistId } });
  if (!artist) {
    return;
  }

  await ctx.db.artist.update({
    where: { id: artistId },
    data: { syncStatus: "SYNCING", syncError: null },
  });

  try {
    const identity = await resolveIdentity(ctx, artist);
    if (identity.mbid !== artist.mbid || identity.country !== artist.country) {
      // Conditional write: only if nobody changed the MBID since we read it.
      const { count } = await ctx.db.artist.updateMany({
        where: { id: artistId, mbid: artist.mbid },
        data: { mbid: identity.mbid, country: identity.country },
      });
      if (count === 0) {
        return;
      }
    }

    const releaseGroups = identity.mbid ? await fetchMusicBrainzReleaseGroups(identity.mbid) : null;

    const [deezerPhoto, wikiBio] = await Promise.all([
      searchDeezerArtistPhoto(artist.name),
      artist.bio ? Promise.resolve(artist.bio) : fetchWikipediaBio(artist.name),
    ]);

    const savedPhoto = await saveImage(ctx, deezerPhoto?.imageUrl, "artists", artist.id);
    if (!(await isIdentityUnchanged(ctx, artistId, identity.mbid))) {
      await deleteMediaFile(savedPhoto, ctx.mediaDir);
      return;
    }

    if (savedPhoto && artist.imagePath && artist.imagePath !== savedPhoto) {
      await deleteMediaFile(artist.imagePath, ctx.mediaDir);
    }

    await ctx.db.artist.update({
      where: { id: artistId },
      data: {
        deezerId: deezerPhoto?.deezerId ?? artist.deezerId,
        bio: wikiBio ?? artist.bio,
        imagePath: savedPhoto ?? artist.imagePath,
      },
    });

    if (releaseGroups) {
      await syncAlbums(ctx, artist, releaseGroups);
    }

    await ctx.db.artist.update({
      where: { id: artistId },
      data: { syncStatus: "SYNCED", syncError: null, syncedAt: new Date() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar";
    await ctx.db.artist
      .update({
        where: { id: artistId },
        data: { syncStatus: "FAILED", syncError: message.slice(0, 500) },
      })
      .catch(() => undefined);
    throw error;
  }
}
