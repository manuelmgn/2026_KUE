import { getEffectiveEntryRating, getEffectiveEntryStatus } from "./rating";
import type { ArtistStatus, ComparisonSortMode, JointAgendaStrategy } from "./schemas";

export const FESTIVAL_RECOMMENDATION_THRESHOLD = 3.2;
const DEFAULT_SET_DURATION_MINUTES = 60;
const LATE_NIGHT_CUTOFF_HOUR = 6;

export type FestivalRecommendationVerdict = "RECOMMENDED" | "NOT_RECOMMENDED" | "INSUFFICIENT_DATA";

export type EntryConsensusTag =
  | "UNANIMOUS_MUST_SEE"
  | "RECOMMENDED"
  | "DIVISIVE"
  | "SKIP"
  | "MIXED"
  | "PENDING";

export interface GroupEditionSummaryDTO {
  id: string;
  festivalId: string;
  brandSlug: string;
  slug: string;
  name: string;
  year: number;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface GroupParticipantDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
}

export interface CoincidingFriendDTO extends GroupParticipantDTO {
  ratingsVisible: boolean;
}

export interface CoincidingFestivalDTO {
  edition: GroupEditionSummaryDTO;
  entriesCount: number;
  coincidingFriends: CoincidingFriendDTO[];
  savedComparisonsCount: number;
  jointAgendasCount: number;
}

export interface ComparisonParticipantSummaryDTO {
  user: GroupParticipantDTO;
  isViewer: boolean;
  ratingsVisible: boolean;
  ratedEntriesCount: number;
  mustSeeCount: number;
  discardedCount: number;
  averageRating: number | null;
}

export interface ComparisonCellDTO {
  userId: string;
  rating: number | null;
  status: ArtistStatus | null;
  liveRating: number | null;
  ratingsPrivate: boolean;
}

export interface ComparisonEntryArtistDTO {
  id: string;
  name: string;
  imagePath: string | null;
}

export interface ComparisonEntryRowDTO {
  entryId: string;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  sortOrder: number;
  artists: ComparisonEntryArtistDTO[];
  cells: ComparisonCellDTO[];
  ratedCount: number;
  averageRating: number | null;
  minRating: number | null;
  maxRating: number | null;
  disagreementSpread: number | null;
  mustSeeCount: number;
  discardedByCount: number;
  consensusTag: EntryConsensusTag;
}

export interface FestivalRecommendationDTO {
  threshold: number;
  averageRating: number | null;
  perParticipantAverageRating: number | null;
  totalRatingsCount: number;
  ratedArtistsCount: number;
  totalArtistsCount: number;
  coverageRatio: number;
  recommended: boolean;
  verdict: FestivalRecommendationVerdict;
}

export interface FestivalComparisonSummaryCountsDTO {
  totalEntriesCount: number;
  visibleEntriesCount: number;
  unanimousMustSeeCount: number;
  recommendedEntriesCount: number;
  divisiveEntriesCount: number;
  unratedEntriesCount: number;
}

export interface FestivalComparisonTableDTO {
  edition: GroupEditionSummaryDTO;
  participants: ComparisonParticipantSummaryDTO[];
  rows: ComparisonEntryRowDTO[];
  recommendation: FestivalRecommendationDTO;
  counts: FestivalComparisonSummaryCountsDTO;
  sortBy: ComparisonSortMode;
}

export interface SavedFestivalComparisonSummaryDTO {
  id: string;
  name: string;
  createdById: string;
  edition: GroupEditionSummaryDTO;
  participants: GroupParticipantDTO[];
  jointAgendasCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFestivalComparisonDTO extends FestivalComparisonTableDTO {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface JointAgendaItemDTO {
  entryId: string;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  sortOrder: number;
  artists: ComparisonEntryArtistDTO[];
  cells: ComparisonCellDTO[];
  averageRating: number | null;
  ratedCount: number;
  mustSeeCount: number;
  discardedByCount: number;
  consensusTag: EntryConsensusTag;
  note: string;
  addedById: string | null;
  addedAt: string;
  hasClash: boolean;
  clashingEntryIds: string[];
}

export interface JointAgendaDayGroupDTO {
  day: string | null;
  items: JointAgendaItemDTO[];
}

export interface JointAgendaConflictDTO {
  day: string;
  entryIdA: string;
  billingNameA: string;
  setTimeA: string;
  stageA: string | null;
  entryIdB: string;
  billingNameB: string;
  setTimeB: string;
  stageB: string | null;
}

export interface JointAgendaSummaryDTO {
  id: string;
  name: string;
  comparisonId: string | null;
  createdById: string;
  minRatingThreshold: number;
  edition: GroupEditionSummaryDTO;
  participants: GroupParticipantDTO[];
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JointAgendaDetailDTO {
  id: string;
  name: string;
  comparisonId: string | null;
  createdById: string;
  isCreator: boolean;
  minRatingThreshold: number;
  edition: GroupEditionSummaryDTO;
  participants: ComparisonParticipantSummaryDTO[];
  recommendation: FestivalRecommendationDTO;
  items: JointAgendaItemDTO[];
  days: JointAgendaDayGroupDTO[];
  conflicts: JointAgendaConflictDTO[];
  createdAt: string;
  updatedAt: string;
}

// Pure inputs for domain computation

export interface RawComparisonEntryInput {
  id: string;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  sortOrder: number;
  artists: ReadonlyArray<ComparisonEntryArtistDTO>;
}

export interface RawComparisonParticipantInput {
  user: GroupParticipantDTO;
  isViewer: boolean;
  ratingsVisible: boolean;
  artistStates: ReadonlyMap<string, { rating: number | null; status: ArtistStatus }>;
  entryLiveRatings: ReadonlyMap<string, number | null>;
}

export interface RawJointAgendaStoredItemInput {
  entryId: string;
  note: string;
  addedById: string | null;
  createdAtIso: string;
}

export interface ParsedSetInterval {
  startMinutes: number;
  endMinutes: number;
}

const SCALE = 10_000;

/**
 * Exact rational threshold check (`sum / count >= threshold`) free of IEEE-754 rounding drift.
 * For threshold = 3.2 (32_000 / 10_000 = 16 / 5), checks `sum * 10_000 >= 32_000 * count`.
 */
export function meetsAverageThreshold(
  sum: number,
  count: number,
  threshold: number = FESTIVAL_RECOMMENDATION_THRESHOLD,
): boolean {
  if (count <= 0) {
    return false;
  }
  const scaledThreshold = Math.round(threshold * SCALE);
  return sum * SCALE >= scaledThreshold * count;
}

export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateFestivalRecommendation(
  scores: ReadonlyArray<number>,
  options: {
    threshold?: number;
    totalArtistsCount?: number;
    ratedArtistsCount?: number;
    participantAverages?: ReadonlyArray<number>;
  } = {},
): FestivalRecommendationDTO {
  const threshold = options.threshold ?? FESTIVAL_RECOMMENDATION_THRESHOLD;
  const totalArtistsCount = Math.max(0, options.totalArtistsCount ?? 0);
  const ratedArtistsCount = Math.min(
    totalArtistsCount,
    Math.max(0, options.ratedArtistsCount ?? 0),
  );
  const coverageRatio =
    totalArtistsCount > 0 ? roundToTwoDecimals(ratedArtistsCount / totalArtistsCount) : 0;

  const participantAvgs = options.participantAverages ?? [];
  const perParticipantAverageRating =
    participantAvgs.length > 0
      ? roundToTwoDecimals(participantAvgs.reduce((acc, v) => acc + v, 0) / participantAvgs.length)
      : null;

  if (scores.length === 0) {
    return {
      threshold,
      averageRating: null,
      perParticipantAverageRating,
      totalRatingsCount: 0,
      ratedArtistsCount,
      totalArtistsCount,
      coverageRatio,
      recommended: false,
      verdict: "INSUFFICIENT_DATA",
    };
  }

  const sum = scores.reduce((acc, s) => acc + s, 0);
  const averageRating = roundToTwoDecimals(sum / scores.length);
  const recommended = meetsAverageThreshold(sum, scores.length, threshold);

  return {
    threshold,
    averageRating,
    perParticipantAverageRating,
    totalRatingsCount: scores.length,
    ratedArtistsCount,
    totalArtistsCount,
    coverageRatio,
    recommended,
    verdict: recommended ? "RECOMMENDED" : "NOT_RECOMMENDED",
  };
}

function deriveEntryConsensusTag(params: {
  ratings: ReadonlyArray<number>;
  sumRatings: number;
  minRating: number | null;
  maxRating: number | null;
  discardedByCount: number;
  visibleStatusParticipantsCount: number;
  threshold: number;
}): EntryConsensusTag {
  const {
    ratings,
    sumRatings,
    minRating,
    maxRating,
    discardedByCount,
    visibleStatusParticipantsCount,
    threshold,
  } = params;

  const allDiscarded =
    visibleStatusParticipantsCount > 0 && discardedByCount === visibleStatusParticipantsCount;
  if (allDiscarded) {
    return "SKIP";
  }

  if (ratings.length === 0) {
    return "PENDING";
  }

  if (maxRating !== null && maxRating <= 2) {
    return "SKIP";
  }

  if (ratings.length >= 2 && minRating !== null && minRating >= 4 && discardedByCount === 0) {
    return "UNANIMOUS_MUST_SEE";
  }

  if (
    ratings.length >= 2 &&
    minRating !== null &&
    maxRating !== null &&
    maxRating - minRating >= 3
  ) {
    return "DIVISIVE";
  }

  if (meetsAverageThreshold(sumRatings, ratings.length, threshold)) {
    return "RECOMMENDED";
  }

  return "MIXED";
}

function sortComparisonRows(
  rows: ReadonlyArray<ComparisonEntryRowDTO>,
  sortBy: ComparisonSortMode,
): ComparisonEntryRowDTO[] {
  if (sortBy === "LINEUP") {
    return [...rows].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.billingName.localeCompare(b.billingName, "es"),
    );
  }

  return [...rows].sort((a, b) => {
    if (sortBy === "AVG_DESC") {
      const aRated = a.averageRating !== null;
      const bRated = b.averageRating !== null;
      if (aRated !== bRated) return aRated ? -1 : 1;
      if (a.averageRating !== b.averageRating) {
        return (b.averageRating ?? 0) - (a.averageRating ?? 0);
      }
      if (a.ratedCount !== b.ratedCount) {
        return b.ratedCount - a.ratedCount;
      }
    } else if (sortBy === "AVG_ASC") {
      const aRated = a.averageRating !== null;
      const bRated = b.averageRating !== null;
      if (aRated !== bRated) return aRated ? -1 : 1;
      if (a.averageRating !== b.averageRating) {
        return (a.averageRating ?? 0) - (b.averageRating ?? 0);
      }
    } else if (sortBy === "DISAGREEMENT_DESC") {
      const aHasSpread = a.disagreementSpread !== null;
      const bHasSpread = b.disagreementSpread !== null;
      if (aHasSpread !== bHasSpread) return aHasSpread ? -1 : 1;
      if (a.disagreementSpread !== b.disagreementSpread) {
        return (b.disagreementSpread ?? 0) - (a.disagreementSpread ?? 0);
      }
      if ((a.averageRating ?? -1) !== (b.averageRating ?? -1)) {
        return (b.averageRating ?? -1) - (a.averageRating ?? -1);
      }
    } else if (sortBy === "MUST_SEE_DESC") {
      if (a.mustSeeCount !== b.mustSeeCount) {
        return b.mustSeeCount - a.mustSeeCount;
      }
      if ((a.averageRating ?? -1) !== (b.averageRating ?? -1)) {
        return (b.averageRating ?? -1) - (a.averageRating ?? -1);
      }
    }

    return a.sortOrder - b.sortOrder || a.billingName.localeCompare(b.billingName, "es");
  });
}

/**
 * Pure builder that constructs the full comparative table, participant statistics,
 * consensus classifications, and automatic festival recommendation (`>= 3.2`).
 */
export function buildComparisonMatrix(params: {
  edition: GroupEditionSummaryDTO;
  entries: ReadonlyArray<RawComparisonEntryInput>;
  participants: ReadonlyArray<RawComparisonParticipantInput>;
  sortBy?: ComparisonSortMode;
  onlyRated?: boolean;
  recommendationThreshold?: number;
}): FestivalComparisonTableDTO {
  const sortBy = params.sortBy ?? "LINEUP";
  const threshold = params.recommendationThreshold ?? FESTIVAL_RECOMMENDATION_THRESHOLD;

  // Unique artists in the festival edition
  const uniqueArtistIds = new Set<string>();
  for (const entry of params.entries) {
    for (const artist of entry.artists) {
      uniqueArtistIds.add(artist.id);
    }
  }

  // Per-participant accumulators
  const ratedEntriesByUser = new Map<string, number>();
  const mustSeeByUser = new Map<string, number>();
  const discardedByUser = new Map<string, number>();
  for (const p of params.participants) {
    ratedEntriesByUser.set(p.user.id, 0);
    mustSeeByUser.set(p.user.id, 0);
    discardedByUser.set(p.user.id, 0);
  }

  const visibleStatusParticipantsCount = params.participants.filter((p) => p.ratingsVisible).length;

  // Build entry rows
  const allRows: ComparisonEntryRowDTO[] = params.entries.map((entry) => {
    const ratings: number[] = [];
    let sumRatings = 0;
    let minRating: number | null = null;
    let maxRating: number | null = null;
    let mustSeeCount = 0;
    let discardedByCount = 0;

    const cells: ComparisonCellDTO[] = params.participants.map((p) => {
      if (!p.ratingsVisible) {
        return {
          userId: p.user.id,
          rating: null,
          status: null,
          liveRating: null,
          ratingsPrivate: true,
        };
      }

      const artistInputs = entry.artists.map((artist) => {
        const state = p.artistStates.get(artist.id);
        return {
          rating: state?.rating ?? null,
          status: state?.status ?? ("PENDING" as const),
        };
      });

      const rating = getEffectiveEntryRating(artistInputs);
      const status = getEffectiveEntryStatus(artistInputs);
      const liveRating = p.entryLiveRatings.get(entry.id) ?? null;

      if (status === "DISCARDED") {
        discardedByCount += 1;
        discardedByUser.set(p.user.id, (discardedByUser.get(p.user.id) ?? 0) + 1);
      }

      if (rating !== null && status !== "DISCARDED") {
        ratings.push(rating);
        sumRatings += rating;
        if (minRating === null || rating < minRating) minRating = rating;
        if (maxRating === null || rating > maxRating) maxRating = rating;
        ratedEntriesByUser.set(p.user.id, (ratedEntriesByUser.get(p.user.id) ?? 0) + 1);
        if (rating >= 4) {
          mustSeeCount += 1;
          mustSeeByUser.set(p.user.id, (mustSeeByUser.get(p.user.id) ?? 0) + 1);
        }
      }

      return {
        userId: p.user.id,
        rating: status === "DISCARDED" ? null : rating,
        status,
        liveRating,
        ratingsPrivate: false,
      };
    });

    const ratedCount = ratings.length;
    const averageRating = ratedCount > 0 ? roundToTwoDecimals(sumRatings / ratedCount) : null;
    const disagreementSpread =
      ratedCount >= 2 && minRating !== null && maxRating !== null ? maxRating - minRating : null;

    const consensusTag = deriveEntryConsensusTag({
      ratings,
      sumRatings,
      minRating,
      maxRating,
      discardedByCount,
      visibleStatusParticipantsCount,
      threshold,
    });

    return {
      entryId: entry.id,
      billingName: entry.billingName,
      subtitle: entry.subtitle,
      day: entry.day,
      stage: entry.stage,
      setTime: entry.setTime,
      sortOrder: entry.sortOrder,
      artists: [...entry.artists],
      cells,
      ratedCount,
      averageRating,
      minRating,
      maxRating,
      disagreementSpread,
      mustSeeCount,
      discardedByCount,
      consensusTag,
    };
  });

  // Global festival recommendation across unique (participant, artist) non-discarded ratings
  const allFestivalScores: number[] = [];
  const ratedArtistSet = new Set<string>();
  const participantAverages: number[] = [];

  const participantSummaries: ComparisonParticipantSummaryDTO[] = params.participants.map((p) => {
    if (!p.ratingsVisible) {
      return {
        user: p.user,
        isViewer: p.isViewer,
        ratingsVisible: false,
        ratedEntriesCount: 0,
        mustSeeCount: 0,
        discardedCount: 0,
        averageRating: null,
      };
    }

    const userScores: number[] = [];
    for (const artistId of uniqueArtistIds) {
      const state = p.artistStates.get(artistId);
      if (state && state.rating !== null && state.status !== "DISCARDED") {
        userScores.push(state.rating);
        allFestivalScores.push(state.rating);
        ratedArtistSet.add(artistId);
      }
    }

    const userAvg =
      userScores.length > 0
        ? roundToTwoDecimals(userScores.reduce((acc, s) => acc + s, 0) / userScores.length)
        : null;

    if (userAvg !== null) {
      participantAverages.push(userAvg);
    }

    return {
      user: p.user,
      isViewer: p.isViewer,
      ratingsVisible: true,
      ratedEntriesCount: ratedEntriesByUser.get(p.user.id) ?? 0,
      mustSeeCount: mustSeeByUser.get(p.user.id) ?? 0,
      discardedCount: discardedByUser.get(p.user.id) ?? 0,
      averageRating: userAvg,
    };
  });

  const recommendation = evaluateFestivalRecommendation(allFestivalScores, {
    threshold,
    totalArtistsCount: uniqueArtistIds.size,
    ratedArtistsCount: ratedArtistSet.size,
    participantAverages,
  });

  let unanimousMustSeeCount = 0;
  let recommendedEntriesCount = 0;
  let divisiveEntriesCount = 0;
  let unratedEntriesCount = 0;

  for (const row of allRows) {
    if (row.consensusTag === "UNANIMOUS_MUST_SEE") {
      unanimousMustSeeCount += 1;
      recommendedEntriesCount += 1;
    } else if (row.consensusTag === "RECOMMENDED") {
      recommendedEntriesCount += 1;
    } else if (row.consensusTag === "DIVISIVE") {
      divisiveEntriesCount += 1;
    }
    if (row.ratedCount === 0) {
      unratedEntriesCount += 1;
    }
  }

  const filteredRows = params.onlyRated ? allRows.filter((row) => row.ratedCount > 0) : allRows;
  const sortedRows = sortComparisonRows(filteredRows, sortBy);

  return {
    edition: params.edition,
    participants: participantSummaries,
    rows: sortedRows,
    recommendation,
    counts: {
      totalEntriesCount: allRows.length,
      visibleEntriesCount: sortedRows.length,
      unanimousMustSeeCount,
      recommendedEntriesCount,
      divisiveEntriesCount,
      unratedEntriesCount,
    },
    sortBy,
  };
}

/**
 * Selects lineup entry IDs for seeding or regenerating a Joint Agenda from a comparative table.
 */
export function selectEntriesForJointAgenda(
  rows: ReadonlyArray<ComparisonEntryRowDTO>,
  options: {
    strategy: JointAgendaStrategy;
    minRatingThreshold?: number;
    customEntryIds?: ReadonlyArray<string>;
  },
): string[] {
  const threshold = options.minRatingThreshold ?? FESTIVAL_RECOMMENDATION_THRESHOLD;
  const validEntryIds = new Set(rows.map((r) => r.entryId));

  if (options.strategy === "EMPTY") {
    return [];
  }

  if (options.strategy === "CUSTOM") {
    const unique = new Set<string>();
    for (const id of options.customEntryIds ?? []) {
      if (validEntryIds.has(id)) {
        unique.add(id);
      }
    }
    return Array.from(unique);
  }

  const selected: string[] = [];
  for (const row of rows) {
    if (row.consensusTag === "SKIP" || row.ratedCount === 0) {
      continue;
    }

    const validRatings = row.cells.map((c) => c.rating).filter((r): r is number => r !== null);
    if (validRatings.length === 0) {
      continue;
    }
    const sum = validRatings.reduce((acc, r) => acc + r, 0);

    if (options.strategy === "RECOMMENDED") {
      if (meetsAverageThreshold(sum, validRatings.length, threshold)) {
        selected.push(row.entryId);
      }
    } else if (options.strategy === "MUST_SEE") {
      if (meetsAverageThreshold(sum, validRatings.length, 4.0)) {
        selected.push(row.entryId);
      }
    } else if (options.strategy === "SHARED_FAVORITES") {
      if (row.mustSeeCount >= 2 && row.discardedByCount === 0) {
        selected.push(row.entryId);
      }
    }
  }

  return selected;
}

function parseClockPoint(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  // Treat 00:00..05:59 as late-night continuation of the festival day (+24h)
  const adjustedHours = hours < LATE_NIGHT_CUTOFF_HOUR ? hours + 24 : hours;
  return adjustedHours * 60 + minutes;
}

/**
 * Parses festival set time strings like "21:30", "01:15", or "21:30 - 22:45" into
 * comparable minute intervals on a festival day (where 00:00-05:59 sorts after 23:59).
 */
export function parseSetTimeMinutes(setTime: string | null): ParsedSetInterval | null {
  if (!setTime) {
    return null;
  }
  const trimmed = setTime.trim();
  if (!trimmed) {
    return null;
  }

  const rangeParts = trimmed.split(/\s*[-–—]\s*/);
  if (rangeParts.length === 2 && rangeParts[0] && rangeParts[1]) {
    const start = parseClockPoint(rangeParts[0]);
    const rawEnd = parseClockPoint(rangeParts[1]);
    if (start === null || rawEnd === null) {
      return null;
    }
    const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
    return { startMinutes: start, endMinutes: end };
  }

  const single = parseClockPoint(trimmed);
  if (single === null) {
    return null;
  }
  return {
    startMinutes: single,
    endMinutes: single + DEFAULT_SET_DURATION_MINUTES,
  };
}

/**
 * Organizes selected Joint Agenda entries chronologically by festival day and setTime,
 * computing schedule clashes (`hasClash`, `clashingEntryIds`, and `conflicts`).
 */
export function organizeJointAgendaEntries(params: {
  comparisonRows: ReadonlyArray<ComparisonEntryRowDTO>;
  storedItems: ReadonlyArray<RawJointAgendaStoredItemInput>;
}): {
  items: JointAgendaItemDTO[];
  days: JointAgendaDayGroupDTO[];
  conflicts: JointAgendaConflictDTO[];
} {
  const rowById = new Map(params.comparisonRows.map((r) => [r.entryId, r]));

  // Preserve day order as seen in the edition's lineup (null / TBA always last)
  const dayOrder = new Map<string, number>();
  for (const row of params.comparisonRows) {
    if (row.day && !dayOrder.has(row.day)) {
      dayOrder.set(row.day, dayOrder.size);
    }
  }

  interface EnrichedEntry {
    row: ComparisonEntryRowDTO;
    stored: RawJointAgendaStoredItemInput;
    interval: ParsedSetInterval | null;
  }

  const enriched: EnrichedEntry[] = [];
  for (const stored of params.storedItems) {
    const row = rowById.get(stored.entryId);
    if (!row) continue;
    enriched.push({
      row,
      stored,
      interval: parseSetTimeMinutes(row.setTime),
    });
  }

  enriched.sort((a, b) => {
    const aDayRank = a.row.day
      ? (dayOrder.get(a.row.day) ?? Number.MAX_SAFE_INTEGER - 1)
      : Number.MAX_SAFE_INTEGER;
    const bDayRank = b.row.day
      ? (dayOrder.get(b.row.day) ?? Number.MAX_SAFE_INTEGER - 1)
      : Number.MAX_SAFE_INTEGER;
    if (aDayRank !== bDayRank) {
      return aDayRank - bDayRank;
    }

    const aHasTime = a.interval !== null;
    const bHasTime = b.interval !== null;
    if (aHasTime !== bHasTime) {
      return aHasTime ? -1 : 1;
    }
    if (a.interval && b.interval && a.interval.startMinutes !== b.interval.startMinutes) {
      return a.interval.startMinutes - b.interval.startMinutes;
    }

    return (
      a.row.sortOrder - b.row.sortOrder || a.row.billingName.localeCompare(b.row.billingName, "es")
    );
  });

  // Detect overlapping sets on the same non-null day
  const clashesByEntryId = new Map<string, Set<string>>();
  const conflicts: JointAgendaConflictDTO[] = [];

  for (let i = 0; i < enriched.length; i += 1) {
    const left = enriched[i];
    if (!left || !left.row.day || !left.interval || !left.row.setTime) continue;

    for (let j = i + 1; j < enriched.length; j += 1) {
      const right = enriched[j];
      if (!right || right.row.day !== left.row.day) break;
      if (!right.interval || !right.row.setTime) continue;

      if (
        left.interval.startMinutes < right.interval.endMinutes &&
        right.interval.startMinutes < left.interval.endMinutes
      ) {
        let leftSet = clashesByEntryId.get(left.row.entryId);
        if (!leftSet) {
          leftSet = new Set();
          clashesByEntryId.set(left.row.entryId, leftSet);
        }
        leftSet.add(right.row.entryId);

        let rightSet = clashesByEntryId.get(right.row.entryId);
        if (!rightSet) {
          rightSet = new Set();
          clashesByEntryId.set(right.row.entryId, rightSet);
        }
        rightSet.add(left.row.entryId);

        conflicts.push({
          day: left.row.day,
          entryIdA: left.row.entryId,
          billingNameA: left.row.billingName,
          setTimeA: left.row.setTime,
          stageA: left.row.stage,
          entryIdB: right.row.entryId,
          billingNameB: right.row.billingName,
          setTimeB: right.row.setTime,
          stageB: right.row.stage,
        });
      }
    }
  }

  const items: JointAgendaItemDTO[] = enriched.map(({ row, stored }) => {
    const clashingIds = Array.from(clashesByEntryId.get(row.entryId) ?? []);
    return {
      entryId: row.entryId,
      billingName: row.billingName,
      subtitle: row.subtitle,
      day: row.day,
      stage: row.stage,
      setTime: row.setTime,
      sortOrder: row.sortOrder,
      artists: row.artists,
      cells: row.cells,
      averageRating: row.averageRating,
      ratedCount: row.ratedCount,
      mustSeeCount: row.mustSeeCount,
      discardedByCount: row.discardedByCount,
      consensusTag: row.consensusTag,
      note: stored.note,
      addedById: stored.addedById,
      addedAt: stored.createdAtIso,
      hasClash: clashingIds.length > 0,
      clashingEntryIds: clashingIds,
    };
  });

  const groupsMap = new Map<string | null, JointAgendaItemDTO[]>();
  for (const item of items) {
    const key = item.day ?? null;
    const list = groupsMap.get(key);
    if (list) {
      list.push(item);
    } else {
      groupsMap.set(key, [item]);
    }
  }

  const days: JointAgendaDayGroupDTO[] = Array.from(groupsMap.entries()).map(([day, dayItems]) => ({
    day,
    items: dayItems,
  }));

  return { items, days, conflicts };
}
