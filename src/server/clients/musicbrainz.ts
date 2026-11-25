import {
  type MusicBrainzArtistCandidate,
  musicBrainzArtistSearchResponseSchema,
  musicBrainzReleaseGroupResponseSchema,
  type ReleaseType,
} from "@/domain/schemas";
import { createRateLimiter, type RateLimiter } from "@/server/rate-limiter";

const MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2";
export const MUSICBRAINZ_USER_AGENT = "KUE/1.0 (https://localhost:5030; local-festival-prep)";
export const MUSICBRAINZ_MIN_INTERVAL_MS = 1100;

/** Max release groups requested from the browse endpoint (MusicBrainz allows up to 100). */
const RELEASE_GROUP_BROWSE_LIMIT = 100;
/** Max release groups kept on the artist shelf after filtering and sorting. */
const SHELF_MAX_RELEASES = 15;
const NOISY_SECONDARY_TYPES = new Set([
  "compilation",
  "remix",
  "dj-mix",
  "mixtape/street",
  "interview",
  "spokenword",
  "audiobook",
  "demo",
]);

export class ExternalApiError extends Error {
  readonly status: number;
  readonly service: string;

  constructor(service: string, status: number, message: string) {
    super(message);
    this.name = "ExternalApiError";
    this.service = service;
    this.status = status;
  }
}

export interface NormalizedReleaseGroup {
  mbid: string;
  title: string;
  releaseYear: number | null;
  releaseType: ReleaseType;
}

// Process-wide limiter (survives HMR) so that *every* MusicBrainz call — background sync and
// interactive disambiguation alike — respects the ≥1.1 s etiquette required by MusicBrainz.
const globalForMusicBrainz = globalThis as typeof globalThis & {
  kueMusicBrainzLimiter?: RateLimiter;
};

function getLimiter(): RateLimiter {
  globalForMusicBrainz.kueMusicBrainzLimiter ??= createRateLimiter(MUSICBRAINZ_MIN_INTERVAL_MS);
  return globalForMusicBrainz.kueMusicBrainzLimiter;
}

/** Overrides the MusicBrainz min interval (tests use 0 to avoid real waits). */
export function setMusicBrainzMinInterval(ms: number): void {
  getLimiter().setMinInterval(ms);
}

async function getMusicBrainzJson(
  resource: string,
  params: URLSearchParams,
  timeoutMs: number,
  label: string,
): Promise<unknown> {
  return getLimiter().schedule(async () => {
    const response = await fetch(`${MUSICBRAINZ_BASE_URL}/${resource}?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": MUSICBRAINZ_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new ExternalApiError(
        "musicbrainz",
        response.status,
        `MusicBrainz ${label} failed with HTTP ${response.status}`,
      );
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ExternalApiError("musicbrainz", 502, `Malformed MusicBrainz ${label} response`);
    }
  });
}

function escapeLucenePhrase(value: string): string {
  return value.replace(/["\\]/g, " ").trim();
}

function parseReleaseYear(rawDate: string | undefined): number | null {
  const match = rawDate?.match(/^(\d{4})/);
  if (!match?.[1]) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

function mapReleaseType(
  primaryType: string | null | undefined,
  secondaryTypes: ReadonlyArray<string>,
): { releaseType: ReleaseType; isNoisy: boolean } {
  const lowerPrimary = (primaryType ?? "").toLowerCase();
  const lowerSecondary = secondaryTypes.map((s) => s.toLowerCase());

  if (lowerSecondary.includes("live")) {
    return { releaseType: "LIVE", isNoisy: false };
  }

  const isNoisy = lowerSecondary.some((s) => NOISY_SECONDARY_TYPES.has(s));

  if (lowerPrimary === "ep") {
    return { releaseType: "EP", isNoisy };
  }
  if (lowerPrimary === "album") {
    return { releaseType: "ALBUM", isNoisy };
  }
  return { releaseType: "OTHER", isNoisy };
}

export async function searchMusicBrainzArtists(
  query: string,
  limit = 5,
  timeoutMs = 10_000,
): Promise<MusicBrainzArtistCandidate[]> {
  const cleaned = escapeLucenePhrase(query);
  if (!cleaned) {
    return [];
  }

  const params = new URLSearchParams({
    query: `artist:"${cleaned}"`,
    fmt: "json",
    limit: String(limit),
  });

  const json = await getMusicBrainzJson("artist", params, timeoutMs, "artist search");
  const parsed = musicBrainzArtistSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExternalApiError("musicbrainz", 502, "Malformed MusicBrainz artist response");
  }

  return parsed.data.artists.slice(0, limit);
}

export async function fetchMusicBrainzReleaseGroups(
  mbid: string,
  limit = RELEASE_GROUP_BROWSE_LIMIT,
  timeoutMs = 10_000,
): Promise<NormalizedReleaseGroup[]> {
  const params = new URLSearchParams({
    artist: mbid,
    type: "album|ep",
    fmt: "json",
    limit: String(Math.min(Math.max(limit, 1), RELEASE_GROUP_BROWSE_LIMIT)),
  });

  const json = await getMusicBrainzJson("release-group", params, timeoutMs, "release-groups");
  const parsed = musicBrainzReleaseGroupResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExternalApiError("musicbrainz", 502, "Malformed MusicBrainz release-group response");
  }

  const annotated = parsed.data["release-groups"].map((rg) => ({
    mbid: rg.id,
    title: rg.title,
    releaseYear: parseReleaseYear(rg["first-release-date"]),
    ...mapReleaseType(rg["primary-type"], rg["secondary-types"] ?? []),
  }));

  // Prefer clean studio/live releases, but fall back to everything for sparse discographies.
  const clean = annotated.filter((item) => !item.isNoisy);
  const chosen = clean.length >= 3 ? clean : annotated;

  return chosen
    .sort((a, b) => (b.releaseYear ?? -1) - (a.releaseYear ?? -1))
    .slice(0, SHELF_MAX_RELEASES)
    .map(({ mbid: id, title, releaseYear, releaseType }) => ({
      mbid: id,
      title,
      releaseYear,
      releaseType,
    }));
}
