import { normalizeArtistName } from "./artist-matching";
import type { ParsedLineupEntry } from "./lineup-parser";

export interface ExistingFestivalEntrySnapshot {
  id: string;
  billingName: string;
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
  artistNames: string[];
}

export interface LineupDiffUpdatedEntry {
  entryId: string;
  billingName: string;
  changes: {
    subtitle?: string;
    day?: string;
    stage?: string;
    setTime?: string;
  };
}

export interface LineupDiffMissingEntry {
  entryId: string;
  billingName: string;
}

export interface PendingLineupDiff {
  checkedAt: string;
  sourceUrl: string;
  method:
    | "clashfinder"
    | "ical"
    | "json-ld"
    | "embedded-json"
    | "html-structured"
    | "plain-text"
    | "gemini";
  added: ParsedLineupEntry[];
  updated: LineupDiffUpdatedEntry[];
  missing: LineupDiffMissingEntry[];
}

function buildArtistSetKey(artistNames: ReadonlyArray<string>): string {
  return artistNames
    .map((name) => normalizeArtistName(name))
    .filter((name) => name.length > 0)
    .sort()
    .join("|");
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * Computes an idempotent, non-destructive diff between a freshly extracted festival lineup
 * and the entries currently stored in KUE.
 *
 * Rules:
 * - Never mutates or removes user ratings, notes, or artist status.
 * - Matches existing entries by normalized `billingName` or exact normalized artist set.
 * - Only proposes filling previously empty metadata (`subtitle`, `day`, `stage`, `setTime`).
 * - Entries absent from the remote source are reported in `missing` for manual review, never auto-deleted.
 */
export function computeLineupDiff(
  existingEntries: ReadonlyArray<ExistingFestivalEntrySnapshot>,
  incomingEntries: ReadonlyArray<ParsedLineupEntry>,
): Pick<PendingLineupDiff, "added" | "updated" | "missing"> {
  const byBillingKey = new Map<string, ExistingFestivalEntrySnapshot[]>();
  const byArtistSetKey = new Map<string, ExistingFestivalEntrySnapshot[]>();

  for (const entry of existingEntries) {
    const billingKey = normalizeArtistName(entry.billingName);
    if (billingKey) {
      const list = byBillingKey.get(billingKey) ?? [];
      list.push(entry);
      byBillingKey.set(billingKey, list);
    }

    const artistKey = buildArtistSetKey(entry.artistNames);
    if (artistKey) {
      const list = byArtistSetKey.get(artistKey) ?? [];
      list.push(entry);
      byArtistSetKey.set(artistKey, list);
    }
  }

  const matchedExistingIds = new Set<string>();
  const seenIncomingKeys = new Set<string>();
  const added: ParsedLineupEntry[] = [];
  const updated: LineupDiffUpdatedEntry[] = [];

  for (const incoming of incomingEntries) {
    const billingKey = normalizeArtistName(incoming.billingName);
    const artistKey = buildArtistSetKey(incoming.artistNames);
    const dedupKey = `${billingKey || artistKey}|${normalizeArtistName(incoming.day ?? "")}|${normalizeArtistName(incoming.stage ?? "")}`;

    if (!billingKey && !artistKey) {
      continue;
    }
    if (seenIncomingKeys.has(dedupKey)) {
      continue;
    }
    seenIncomingKeys.add(dedupKey);

    const candidates =
      byBillingKey.get(billingKey) ?? (artistKey ? byArtistSetKey.get(artistKey) : undefined) ?? [];

    const existing = candidates.find((c) => !matchedExistingIds.has(c.id)) ?? candidates[0] ?? null;

    if (!existing) {
      added.push({
        billingName: incoming.billingName.trim(),
        artistNames: incoming.artistNames.map((n) => n.trim()).filter((n) => n.length > 0),
        subtitle: cleanOptionalText(incoming.subtitle),
        day: cleanOptionalText(incoming.day),
        stage: cleanOptionalText(incoming.stage),
        setTime: cleanOptionalText(incoming.setTime),
      });
      continue;
    }

    const firstMatch = !matchedExistingIds.has(existing.id);
    matchedExistingIds.add(existing.id);

    if (!firstMatch) {
      continue;
    }

    const changes: LineupDiffUpdatedEntry["changes"] = {};
    const nextSubtitle = cleanOptionalText(incoming.subtitle);
    const nextDay = cleanOptionalText(incoming.day);
    const nextStage = cleanOptionalText(incoming.stage);
    const nextSetTime = cleanOptionalText(incoming.setTime);

    if (!cleanOptionalText(existing.subtitle) && nextSubtitle) {
      changes.subtitle = nextSubtitle;
    }
    if (!cleanOptionalText(existing.day) && nextDay) {
      changes.day = nextDay;
    }
    if (!cleanOptionalText(existing.stage) && nextStage) {
      changes.stage = nextStage;
    }
    if (!cleanOptionalText(existing.setTime) && nextSetTime) {
      changes.setTime = nextSetTime;
    }

    if (Object.keys(changes).length > 0) {
      updated.push({
        entryId: existing.id,
        billingName: existing.billingName,
        changes,
      });
    }
  }

  const missing: LineupDiffMissingEntry[] = [];
  if (incomingEntries.length > 0) {
    for (const existing of existingEntries) {
      if (!matchedExistingIds.has(existing.id)) {
        missing.push({
          entryId: existing.id,
          billingName: existing.billingName,
        });
      }
    }
  }

  return { added, updated, missing };
}

export function hasPendingDiffChanges(
  diff: Pick<PendingLineupDiff, "added" | "updated" | "missing"> | null | undefined,
): boolean {
  if (!diff) {
    return false;
  }
  return diff.added.length > 0 || diff.updated.length > 0 || diff.missing.length > 0;
}
