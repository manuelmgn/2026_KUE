import {
  wikipediaOpenSearchResponseSchema,
  wikipediaSummaryResponseSchema,
} from "@/domain/schemas";

const WIKI_OPENSEARCH_URL = "https://en.wikipedia.org/w/api.php";
const WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const WIKI_USER_AGENT = "KUE/1.0 (https://localhost:5030; local-festival-prep)";

function trimEditorialSummary(rawText: string, maxChars = 400): string {
  const clean = rawText.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }

  const slice = clean.slice(0, maxChars);
  const lastPeriod = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastPeriod >= Math.floor(maxChars * 0.45)) {
    return slice.slice(0, lastPeriod + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

async function openSearchTitles(query: string, timeoutMs: number): Promise<string[]> {
  const params = new URLSearchParams({
    action: "opensearch",
    search: query,
    limit: "3",
    format: "json",
  });

  const response = await fetch(`${WIKI_OPENSEARCH_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": WIKI_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const json: unknown = await response.json();
  const parsed = wikipediaOpenSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    return [];
  }

  return parsed.data[1];
}

async function fetchSummaryByTitle(
  title: string,
  timeoutMs: number,
): Promise<{ extract: string | null; isDisambiguation: boolean }> {
  const response = await fetch(`${WIKI_SUMMARY_URL}/${encodeURIComponent(title)}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": WIKI_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return { extract: null, isDisambiguation: false };
  }

  const json: unknown = await response.json();
  const parsed = wikipediaSummaryResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { extract: null, isDisambiguation: false };
  }

  if (parsed.data.type === "disambiguation") {
    return { extract: null, isDisambiguation: true };
  }

  const extract = parsed.data.extract?.trim();
  return {
    extract: extract ? trimEditorialSummary(extract) : null,
    isDisambiguation: false,
  };
}

export async function fetchWikipediaBio(
  artistName: string,
  timeoutMs = 8_000,
): Promise<string | null> {
  const trimmed = artistName.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const titles = await openSearchTitles(trimmed, timeoutMs);
    for (const title of titles) {
      const result = await fetchSummaryByTitle(title, timeoutMs);
      if (result.extract) {
        return result.extract;
      }
      if (result.isDisambiguation) {
        const musicTitles = await openSearchTitles(`${trimmed} (musician)`, timeoutMs);
        for (const musicTitle of musicTitles) {
          const musicSummary = await fetchSummaryByTitle(musicTitle, timeoutMs);
          if (musicSummary.extract) {
            return musicSummary.extract;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
