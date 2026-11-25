import {
  type MusicBrainzArtistCandidate,
  musicBrainzArtistSearchResponseSchema,
  musicBrainzReleaseGroupResponseSchema,
  type ReleaseType,
} from "@/domain/schemas";

const MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2";
export const MUSICBRAINZ_USER_AGENT = "KUE/1.0 (https://localhost:5030; local-festival-prep)";

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

function escapeLucenePhrase(value: string): string {
  return value.replace(/["\\]/g, " ").trim();
}

function parseReleaseYear(rawDate: string | undefined): number | null {
  if (!rawDate) {
    return null;
  }
  const match = rawDate.match(/^(\d{4})/);
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

  const isNoisy = lowerSecondary.some((s) =>
    ["compilation", "remix", "dj-mix", "mixtape/street", "interview", "spokenword"].includes(s),
  );

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

  const response = await fetch(`${MUSICBRAINZ_BASE_URL}/artist?${params.toString()}`, {
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
      `MusicBrainz artist search failed with HTTP ${response.status}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = musicBrainzArtistSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExternalApiError("musicbrainz", 502, "Malformed MusicBrainz artist response");
  }

  return parsed.data.artists.slice(0, limit);
}

export async function fetchMusicBrainzReleaseGroups(
  mbid: string,
  limit = 25,
  timeoutMs = 10_000,
): Promise<NormalizedReleaseGroup[]> {
  const params = new URLSearchParams({
    artist: mbid,
    type: "album|ep",
    fmt: "json",
    limit: String(limit),
  });

  const response = await fetch(`${MUSICBRAINZ_BASE_URL}/release-group?${params.toString()}`, {
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
      `MusicBrainz release-groups failed with HTTP ${response.status}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = musicBrainzReleaseGroupResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExternalApiError("musicbrainz", 502, "Malformed MusicBrainz release-group response");
  }

  const annotated = parsed.data["release-groups"].map((rg) => {
    const { releaseType, isNoisy } = mapReleaseType(
      rg["primary-type"],
      rg["secondary-types"] ?? [],
    );
    return {
      mbid: rg.id,
      title: rg.title,
      releaseYear: parseReleaseYear(rg["first-release-date"]),
      releaseType,
      isNoisy,
    };
  });

  const clean = annotated.filter((item) => !item.isNoisy);
  const chosen = clean.length >= 3 ? clean : annotated;

  return chosen
    .sort((a, b) => (b.releaseYear ?? -1) - (a.releaseYear ?? -1))
    .slice(0, 15)
    .map(({ mbid: id, title, releaseYear, releaseType }) => ({
      mbid: id,
      title,
      releaseYear,
      releaseType,
    }));
}
