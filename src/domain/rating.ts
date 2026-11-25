import { normalizeArtistName } from "./artist-matching";
import type { ArtistStatus, RatingFilter, StatusFilter } from "./schemas";

export interface RateableArtist {
  name: string;
  rating: number | null;
  status: ArtistStatus;
  notes: string;
}

export interface FilterableEntry {
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  artists: ReadonlyArray<RateableArtist>;
}

export interface EntryFilterCriteria {
  query?: string;
  status?: StatusFilter;
  rating?: RatingFilter;
}

export interface ShelfAlbum {
  id: string;
  title: string;
  releaseYear: number | null;
  isPinned: boolean;
}

/**
 * Convenience rule (SPEC 2.2): assigning a 1..5 rating to a PENDING or LISTENING artist
 * automatically promotes their status to RATED.
 */
export function resolveStatusOnRating(
  currentStatus: ArtistStatus,
  newRating: number | null,
): ArtistStatus {
  if (newRating !== null && (currentStatus === "PENDING" || currentStatus === "LISTENING")) {
    return "RATED";
  }
  return currentStatus;
}

export function getEffectiveEntryRating(
  artists: ReadonlyArray<Pick<RateableArtist, "rating">>,
): number | null {
  let best: number | null = null;
  for (const artist of artists) {
    if (artist.rating !== null && (best === null || artist.rating > best)) {
      best = artist.rating;
    }
  }
  return best;
}

export function getEffectiveEntryStatus(
  artists: ReadonlyArray<Pick<RateableArtist, "status">>,
): ArtistStatus {
  if (artists.length === 0) {
    return "PENDING";
  }
  const allDiscarded = artists.every((artist) => artist.status === "DISCARDED");
  if (allDiscarded) {
    return "DISCARDED";
  }
  if (artists.some((artist) => artist.status === "RATED")) {
    return "RATED";
  }
  if (artists.some((artist) => artist.status === "LISTENING")) {
    return "LISTENING";
  }
  return "PENDING";
}

export function matchesRatingFilter(rating: number | null, filter: RatingFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "MUST":
      return rating !== null && rating >= 4;
    case "5":
      return rating === 5;
    case "4":
      return rating === 4;
    case "3":
      return rating === 3;
    case "LOW":
      return rating !== null && rating <= 2;
    case "UNRATED":
      return rating === null;
  }
}

export function matchesEntryFilters(
  entry: FilterableEntry,
  criteria: EntryFilterCriteria,
): boolean {
  const statusFilter = criteria.status ?? "ALL";
  const ratingFilter = criteria.rating ?? "ALL";
  const rawQuery = criteria.query?.trim() ?? "";

  if (statusFilter !== "ALL") {
    const matchesAnyStatus =
      entry.artists.some((artist) => artist.status === statusFilter) ||
      getEffectiveEntryStatus(entry.artists) === statusFilter;
    if (!matchesAnyStatus) {
      return false;
    }
  }

  const effectiveRating = getEffectiveEntryRating(entry.artists);
  if (!matchesRatingFilter(effectiveRating, ratingFilter)) {
    return false;
  }

  if (rawQuery.length > 0) {
    const needle = normalizeArtistName(rawQuery);
    const haystack = [
      entry.billingName,
      entry.subtitle ?? "",
      entry.day ?? "",
      entry.stage ?? "",
      ...entry.artists.flatMap((artist) => [artist.name, artist.notes]),
    ]
      .map(normalizeArtistName)
      .join(" ");

    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

export function sortAlbumsForShelf<T extends ShelfAlbum>(albums: ReadonlyArray<T>): T[] {
  return [...albums].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const yearA = a.releaseYear ?? -1;
    const yearB = b.releaseYear ?? -1;
    if (yearA !== yearB) {
      return yearB - yearA;
    }
    return a.title.localeCompare(b.title, "es");
  });
}
