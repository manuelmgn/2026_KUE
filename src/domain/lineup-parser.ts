import { normalizeArtistName } from "./artist-matching";

export interface ParsedLineupEntry {
  billingName: string;
  artistNames: string[];
  subtitle: string | null;
  day: string | null;
  stage: string | null;
  setTime: string | null;
}

const INDEX_HEADING_PREFIX_REGEX = /^[A-Z]\s*[–—-]\s*[A-Z]\s*:\s*/i;
const BULLET_PREFIX_REGEX = /^(?:[•●▪◦‣–—*-]|\d+[.)])\s+/;
const TABULAR_SPLIT_REGEX = /\t|\s+\|\s+|\s+—\s+/;
const QUOTED_SUBTITLE_REGEX =
  /(?:^|\s)(?:'([^']{2,})'|"([^"]{2,})"|‘([^’]{2,})’|“([^”]{2,})”)(?=$|\s|,|\()/g;
const TRAILING_PAREN_REGEX = /\s*\(([^()]+)\)\s*$/;
const COLLAB_CONNECTOR_REGEX = /\s+(?:&|feat\.?|ft\.?|featuring|w\/|\+)\s+/i;
const TIME_REGEX = /^(?:[01]?\d|2[0-3])[:h][0-5]\d$/i;
const DAY_REGEX =
  /^(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|xoves|venres|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?:\s+\d{1,2})?|\d{1,2}\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))$/i;

const GENERIC_ENSEMBLE_ONLY_REGEX = /^ensemble$/i;

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingDecorators(raw: string): string {
  let result = raw.trim();
  result = result.replace(INDEX_HEADING_PREFIX_REGEX, "");
  result = result.replace(BULLET_PREFIX_REGEX, "");
  return result.trim();
}

function isTabularLine(line: string): boolean {
  return /\t|\s+\|\s+|\s+—\s+/.test(line);
}

function classifyMetadataColumns(columns: string[]): {
  day: string | null;
  stage: string | null;
  setTime: string | null;
} {
  let day: string | null = null;
  let stage: string | null = null;
  let setTime: string | null = null;

  for (const rawCol of columns) {
    const col = cleanSpaces(rawCol);
    if (!col) {
      continue;
    }

    if (!setTime && TIME_REGEX.test(col)) {
      setTime = col.replace(/h/i, ":");
      continue;
    }

    if (!day && DAY_REGEX.test(col)) {
      day = col;
      continue;
    }

    if (!stage) {
      stage = col;
    } else if (!day) {
      day = col;
    }
  }

  return { day, stage, setTime };
}

function extractSubtitlesAndCleanCore(billing: string): {
  core: string;
  subtitle: string | null;
} {
  let working = cleanSpaces(billing);
  const subtitleParts: string[] = [];

  // 1. Extract quoted subtitles bounded by whitespace/start/end (preserves I'A'V and L'Rain)
  working = working.replace(
    QUOTED_SUBTITLE_REGEX,
    (_match, g1?: string, g2?: string, g3?: string, g4?: string) => {
      const content = cleanSpaces(g1 ?? g2 ?? g3 ?? g4 ?? "");
      if (content) {
        subtitleParts.push(content);
      }
      return " ";
    },
  );
  working = cleanSpaces(working);

  // 2. Extract trailing parenthetical qualifiers like (live AV), (estrea mundial), (solo)
  const parenParts: string[] = [];
  while (TRAILING_PAREN_REGEX.test(working)) {
    const match = working.match(TRAILING_PAREN_REGEX);
    const content = match?.[1] ? cleanSpaces(match[1]) : "";
    if (!content) {
      break;
    }
    const remainder = cleanSpaces(working.slice(0, match?.index ?? working.length));
    if (!remainder) {
      break;
    }
    parenParts.unshift(content);
    working = remainder;
  }

  subtitleParts.push(...parenParts);

  return {
    core: working,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : null,
  };
}

function splitCollaboratingArtists(core: string): string[] {
  const hasCollabConnector = COLLAB_CONNECTOR_REGEX.test(core);
  if (!hasCollabConnector) {
    const single = cleanSpaces(core);
    return single ? [single] : [];
  }

  const primaryParts = core
    .split(COLLAB_CONNECTOR_REGEX)
    .map(cleanSpaces)
    .filter((part) => part.length > 0);

  const expanded: string[] = [];
  for (const part of primaryParts) {
    if (part.includes(",")) {
      const commaParts = part
        .split(",")
        .map(cleanSpaces)
        .filter((sub) => sub.length > 0);
      expanded.push(...commaParts);
    } else {
      expanded.push(part);
    }
  }

  // Deduplicate within the same entry while preserving order and dropping bare "Ensemble"
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const name of expanded) {
    if (GENERIC_ENSEMBLE_ONLY_REGEX.test(name) && expanded.length > 1) {
      continue;
    }
    const normalized = normalizeArtistName(name);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    filtered.push(name);
  }

  return filtered.length > 0 ? filtered : [cleanSpaces(core)];
}

function parseSingleItem(rawItem: string): ParsedLineupEntry | null {
  const cleaned = stripLeadingDecorators(rawItem);
  if (!cleaned) {
    return null;
  }

  // Ignore standalone section headings like "A – D:" with nothing after them
  if (/^[A-Z]\s*[–—-]\s*[A-Z]\s*:?$/i.test(cleaned)) {
    return null;
  }

  let billingName = cleaned;
  let day: string | null = null;
  let stage: string | null = null;
  let setTime: string | null = null;

  if (isTabularLine(cleaned)) {
    const columns = cleaned
      .split(TABULAR_SPLIT_REGEX)
      .map(cleanSpaces)
      .filter((col) => col.length > 0);

    const firstColumn = columns[0];
    if (!firstColumn) {
      return null;
    }
    billingName = firstColumn;
    const meta = classifyMetadataColumns(columns.slice(1));
    day = meta.day;
    stage = meta.stage;
    setTime = meta.setTime;
  }

  const { core, subtitle } = extractSubtitlesAndCleanCore(billingName);
  const artistNames = splitCollaboratingArtists(core || billingName);

  if (artistNames.length === 0) {
    return null;
  }

  return {
    billingName,
    artistNames,
    subtitle,
    day,
    stage,
    setTime,
  };
}

/**
 * Deterministic lineup parser for raw festival announcements, inline mid-dot lists,
 * and tabular `Artist | Day | Stage` formats. Zero external APIs or LLMs.
 */
export function parseRawLineup(rawText: string): ParsedLineupEntry[] {
  const lines = rawText.split(/\r?\n/);
  const entries: ParsedLineupEntry[] = [];
  const seenKeys = new Set<string>();

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      continue;
    }

    const withoutHeading = stripLeadingDecorators(trimmedLine);
    if (!withoutHeading) {
      continue;
    }

    const segments = isTabularLine(withoutHeading)
      ? [withoutHeading]
      : withoutHeading.split(/\s*·\s*/);

    for (const segment of segments) {
      const parsed = parseSingleItem(segment);
      if (!parsed) {
        continue;
      }

      const dedupKey = [
        normalizeArtistName(parsed.billingName),
        normalizeArtistName(parsed.day ?? ""),
        normalizeArtistName(parsed.stage ?? ""),
      ].join("|");

      if (seenKeys.has(dedupKey)) {
        continue;
      }

      seenKeys.add(dedupKey);
      entries.push(parsed);
    }
  }

  return entries;
}
