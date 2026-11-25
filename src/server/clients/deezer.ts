import { normalizeArtistName } from "@/domain/artist-matching";
import {
  deezerAlbumSearchResponseSchema,
  deezerArtistSearchResponseSchema,
} from "@/domain/schemas";

const DEEZER_BASE_URL = "https://api.deezer.com";

export interface DeezerArtistPhotoResult {
  deezerId: string;
  imageUrl: string | null;
}

/**
 * GETs a Deezer search endpoint. Deezer is a best-effort enrichment source: network errors,
 * timeouts, non-2xx responses and malformed bodies all resolve to `null` instead of throwing,
 * so a flaky image lookup never fails the whole artist sync.
 */
async function getDeezerJson(
  path: string,
  params: URLSearchParams,
  timeoutMs: number,
): Promise<unknown> {
  try {
    const response = await fetch(`${DEEZER_BASE_URL}${path}?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function searchDeezerArtistPhoto(
  artistName: string,
  timeoutMs = 10_000,
): Promise<DeezerArtistPhotoResult | null> {
  const trimmed = artistName.trim();
  if (!trimmed) {
    return null;
  }

  const json = await getDeezerJson(
    "/search/artist",
    new URLSearchParams({ q: trimmed, limit: "3" }),
    timeoutMs,
  );
  const parsed = deezerArtistSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }

  const targetNorm = normalizeArtistName(trimmed);
  const best =
    parsed.data.data.find((item) => normalizeArtistName(item.name) === targetNorm) ??
    parsed.data.data[0];

  if (!best) {
    return null;
  }

  return {
    deezerId: String(best.id),
    imageUrl: best.picture_xl ?? best.picture_big ?? best.picture_medium ?? null,
  };
}

export async function searchDeezerAlbumCover(
  artistName: string,
  albumTitle: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  const cleanArtist = artistName.replace(/"/g, " ").trim();
  const cleanAlbum = albumTitle.replace(/"/g, " ").trim();
  if (!cleanArtist || !cleanAlbum) {
    return null;
  }

  const json = await getDeezerJson(
    "/search/album",
    new URLSearchParams({ q: `artist:"${cleanArtist}" album:"${cleanAlbum}"`, limit: "3" }),
    timeoutMs,
  );
  const parsed = deezerAlbumSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }

  const targetAlbumNorm = normalizeArtistName(cleanAlbum);
  const best =
    parsed.data.data.find((item) => normalizeArtistName(item.title) === targetAlbumNorm) ??
    parsed.data.data[0];

  if (!best) {
    return null;
  }

  return best.cover_xl ?? best.cover_big ?? best.cover_medium ?? null;
}
