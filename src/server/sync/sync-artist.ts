import type { PrismaClient } from "@/generated/prisma/client";
import { searchDeezerAlbumCover, searchDeezerArtistPhoto } from "@/server/clients/deezer";
import {
  fetchMusicBrainzReleaseGroups,
  searchMusicBrainzArtists,
} from "@/server/clients/musicbrainz";
import { fetchWikipediaBio } from "@/server/clients/wikipedia";
import { getDb } from "@/server/db";
import { downloadAndSaveMedia } from "@/server/media-storage";

export interface SyncArtistOptions {
  db?: PrismaClient;
  mediaDir?: string;
  rateLimitMs?: number;
}

function waitMs(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function syncArtist(artistId: string, options: SyncArtistOptions = {}): Promise<void> {
  const db = options.db ?? getDb();
  const rateLimitMs = options.rateLimitMs ?? 1100;

  const artist = await db.artist.findUnique({
    where: { id: artistId },
    include: { albums: true },
  });

  if (!artist) {
    return;
  }

  await db.artist.update({
    where: { id: artistId },
    data: { syncStatus: "SYNCING", syncError: null },
  });

  try {
    let mbid = artist.mbid;
    let country = artist.country;
    let madeMbCall = false;

    if (!mbid) {
      const candidates = await searchMusicBrainzArtists(artist.name, 5);
      madeMbCall = true;
      const top = candidates[0];
      if (top) {
        const existingWithMbid = await db.artist.findUnique({
          where: { mbid: top.id },
          select: { id: true },
        });
        if (!existingWithMbid || existingWithMbid.id === artist.id) {
          mbid = top.id;
        }
        country = top.country ?? country;
      }
    }

    const releaseGroups = mbid
      ? await (async () => {
          if (madeMbCall) {
            await waitMs(rateLimitMs);
          }
          return fetchMusicBrainzReleaseGroups(mbid, 25);
        })()
      : [];

    const [deezerPhoto, wikiBio] = await Promise.all([
      searchDeezerArtistPhoto(artist.name),
      artist.bio ? Promise.resolve(artist.bio) : fetchWikipediaBio(artist.name),
    ]);

    let imagePath = artist.imagePath;
    if (deezerPhoto?.imageUrl) {
      const downloadOpts = options.mediaDir
        ? {
            url: deezerPhoto.imageUrl,
            bucket: "artists" as const,
            baseName: artist.id,
            mediaDir: options.mediaDir,
          }
        : {
            url: deezerPhoto.imageUrl,
            bucket: "artists" as const,
            baseName: artist.id,
          };
      const saved = await downloadAndSaveMedia(downloadOpts);
      if (saved) {
        imagePath = saved;
      }
    }

    await db.artist.update({
      where: { id: artistId },
      data: {
        mbid,
        country,
        deezerId: deezerPhoto?.deezerId ?? artist.deezerId,
        bio: wikiBio ?? artist.bio,
        imagePath,
      },
    });

    for (const rg of releaseGroups) {
      const album = await db.album.upsert({
        where: {
          artistId_mbid: {
            artistId: artist.id,
            mbid: rg.mbid,
          },
        },
        update: {
          title: rg.title,
          releaseYear: rg.releaseYear,
          releaseType: rg.releaseType,
        },
        create: {
          artistId: artist.id,
          mbid: rg.mbid,
          title: rg.title,
          releaseYear: rg.releaseYear,
          releaseType: rg.releaseType,
        },
      });

      if (!album.coverPath) {
        const coverUrl = await searchDeezerAlbumCover(artist.name, rg.title);
        if (coverUrl) {
          const coverOpts = options.mediaDir
            ? {
                url: coverUrl,
                bucket: "albums" as const,
                baseName: album.id,
                mediaDir: options.mediaDir,
              }
            : {
                url: coverUrl,
                bucket: "albums" as const,
                baseName: album.id,
              };
          const savedCover = await downloadAndSaveMedia(coverOpts);
          if (savedCover) {
            await db.album.update({
              where: { id: album.id },
              data: { coverPath: savedCover },
            });
          }
        }
      }
    }

    await db.artist.update({
      where: { id: artistId },
      data: {
        syncStatus: "SYNCED",
        syncError: null,
        syncedAt: new Date(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar";
    await db.artist.update({
      where: { id: artistId },
      data: {
        syncStatus: "FAILED",
        syncError: message.slice(0, 500),
      },
    });
    throw error;
  }
}
