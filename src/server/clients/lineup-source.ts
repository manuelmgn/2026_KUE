import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { normalizeArtistName } from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import { type ParsedLineupEntry, parseRawLineup } from "@/domain/lineup-parser";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_TEXT_FOR_LLM_CHARS = 80_000;
const LINEUP_FETCH_USER_AGENT = "KUE/1.0 (+https://localhost:5030; festival-lineup-sync)";

export type LineupExtractionMethod = "clashfinder" | "json-ld" | "plain-text" | "gemini";

export interface FetchLineupSourceOptions {
  festivalName: string;
  festivalYear: number;
  previousContentHash?: string | null | undefined;
  force?: boolean | undefined;
  geminiApiKey?: string | undefined;
  geminiModel?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  llmExtractor?:
    | ((params: {
        text: string;
        sourceUrl: string;
        festivalName: string;
        festivalYear: number;
        apiKey: string;
        model: string;
      }) => Promise<ParsedLineupEntry[]>)
    | undefined;
}

export interface FetchLineupSourceResult {
  unchanged: boolean;
  contentHash: string;
  method: LineupExtractionMethod | null;
  entries: ParsedLineupEntry[];
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1?\]?$/,
  /^\[?::ffff:/i,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
];

export function validateLineupSourceUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new DomainError("La URL del cartel no es válida");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DomainError("La URL del cartel debe usar http:// o https://");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new DomainError("La URL del cartel no puede apuntar a direcciones privadas o locales");
  }

  return parsed;
}

export function hashLineupContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#(\d+);/g, (_match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    });
}

export function htmlToCompactText(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withLineBreaks = withoutNoise
    .replace(/<\/?(?:p|div|li|tr|h[1-6]|br|section|article|header|footer|dd|dt)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeHtmlEntities(withLineBreaks);
  const lines = decoded
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  return lines.join("\n").slice(0, MAX_TEXT_FOR_LLM_CHARS);
}

function extractIsoDayAndTime(rawDate: unknown): { day: string | null; setTime: string | null } {
  if (typeof rawDate !== "string" || !rawDate.trim()) {
    return { day: null, setTime: null };
  }
  const isoMatch = rawDate.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!isoMatch) {
    return { day: null, setTime: null };
  }
  return {
    day: isoMatch[1] ?? null,
    setTime: isoMatch[2] ?? null,
  };
}

function normalizeExtractedEntry(entry: {
  billingName: string;
  artistNames?: string[] | undefined;
  subtitle?: string | null | undefined;
  day?: string | null | undefined;
  stage?: string | null | undefined;
  setTime?: string | null | undefined;
}): ParsedLineupEntry | null {
  const billingName = entry.billingName.replace(/\s+/g, " ").trim();
  if (!billingName) {
    return null;
  }

  const parsedFallback = parseRawLineup(billingName)[0];
  const explicitArtists = (entry.artistNames ?? [])
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => name.length > 0);

  const artistNames =
    explicitArtists.length > 0 ? explicitArtists : (parsedFallback?.artistNames ?? [billingName]);

  const subtitle = entry.subtitle?.trim() || parsedFallback?.subtitle || null;
  const day = entry.day?.trim() || parsedFallback?.day || null;
  const stage = entry.stage?.trim() || parsedFallback?.stage || null;
  const setTime = entry.setTime?.trim() || parsedFallback?.setTime || null;

  return {
    billingName,
    artistNames,
    subtitle,
    day,
    stage,
    setTime,
  };
}

function deduplicateEntries(entries: ReadonlyArray<ParsedLineupEntry>): ParsedLineupEntry[] {
  const seen = new Set<string>();
  const result: ParsedLineupEntry[] = [];

  for (const entry of entries) {
    const key = [
      normalizeArtistName(entry.billingName),
      normalizeArtistName(entry.day ?? ""),
      normalizeArtistName(entry.stage ?? ""),
    ].join("|");
    if (!normalizeArtistName(entry.billingName) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }

  return result;
}

/**
 * Extracts festival performers from `<script type="application/ld+json">` schema.org blocks.
 */
export function extractLineupFromJsonLd(html: string): ParsedLineupEntry[] {
  const scriptRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const collected: ParsedLineupEntry[] = [];

  const visitNode = (
    node: unknown,
    inherited: { day: string | null; stage: string | null; setTime: string | null },
  ) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visitNode(item, inherited);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) {
      visitNode(record["@graph"], inherited);
    }

    const rawType = record["@type"];
    const types = Array.isArray(rawType) ? rawType : typeof rawType === "string" ? [rawType] : [];
    const isEvent = types.some(
      (t) =>
        typeof t === "string" &&
        /^(MusicEvent|MusicFestival|Festival|Event|TheaterEvent|SocialEvent)$/i.test(t),
    );

    const dateInfo = extractIsoDayAndTime(record.startDate);
    const location = record.location as Record<string, unknown> | undefined;
    const stageName =
      typeof location?.name === "string" && location.name.trim() ? location.name.trim() : null;

    const currentContext = {
      day: dateInfo.day ?? inherited.day,
      stage: stageName ?? inherited.stage,
      setTime: dateInfo.setTime ?? inherited.setTime,
    };

    if (isEvent) {
      const rawPerformers = record.performer ?? record.performers;
      const performerList = Array.isArray(rawPerformers)
        ? rawPerformers
        : rawPerformers
          ? [rawPerformers]
          : [];

      for (const performer of performerList) {
        let name: string | null = null;
        if (typeof performer === "string") {
          name = performer;
        } else if (performer && typeof performer === "object") {
          const performerName = (performer as Record<string, unknown>).name;
          if (typeof performerName === "string") {
            name = performerName;
          }
        }

        if (name) {
          const normalized = normalizeExtractedEntry({
            billingName: name,
            day: currentContext.day,
            stage: currentContext.stage,
            setTime: currentContext.setTime,
          });
          if (normalized) {
            collected.push(normalized);
          }
        }
      }
    }

    if (record.subEvent) {
      visitNode(record.subEvent, currentContext);
    }
    if (record.subEvents) {
      visitNode(record.subEvents, currentContext);
    }
  };

  for (const match of html.matchAll(scriptRegex)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      visitNode(parsed, { day: null, stage: null, setTime: null });
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return deduplicateEntries(collected);
}

const clashfinderEventSchema = z.object({
  name: z.string().min(1),
  start: z.string().optional(),
  short: z.string().optional(),
});

const clashfinderLocationSchema = z.object({
  name: z.string().optional(),
  events: z.array(clashfinderEventSchema).default([]),
});

const clashfinderResponseSchema = z.object({
  locations: z.array(clashfinderLocationSchema).default([]),
});

export function getClashfinderJsonUrl(url: URL): string | null {
  if (!/(^|\.)clashfinder\.com$/i.test(url.hostname)) {
    return null;
  }
  const slugMatch = url.pathname.match(/^\/s\/([a-z0-9_-]+)/i);
  if (slugMatch?.[1]) {
    return `https://clashfinder.com/data/event/${slugMatch[1]}.json`;
  }
  if (/^\/data\/event\/[a-z0-9_-]+\.json$/i.test(url.pathname)) {
    return url.toString();
  }
  return null;
}

export function extractLineupFromClashfinderJson(json: unknown): ParsedLineupEntry[] {
  const parsed = clashfinderResponseSchema.safeParse(json);
  if (!parsed.success) {
    return [];
  }

  const collected: ParsedLineupEntry[] = [];
  for (const location of parsed.data.locations) {
    const stage = location.name?.trim() || null;
    for (const event of location.events) {
      const { day, setTime } = extractIsoDayAndTime(event.start);
      const normalized = normalizeExtractedEntry({
        billingName: event.name,
        day,
        stage,
        setTime,
      });
      if (normalized) {
        collected.push(normalized);
      }
    }
  }

  return deduplicateEntries(collected);
}

const geminiLineupResponseSchema = z.object({
  entries: z
    .array(
      z.object({
        billingName: z.string().min(1),
        artistNames: z.array(z.string().min(1)).default([]),
        subtitle: z.string().nullable().optional(),
        day: z.string().nullable().optional(),
        stage: z.string().nullable().optional(),
        setTime: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

const GEMINI_LINEUP_JSON_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      description: "Music artists / acts announced on the festival lineup page.",
      items: {
        type: "object",
        properties: {
          billingName: {
            type: "string",
            description: "Exact billed act name as shown on the lineup (without stage/day/time).",
          },
          artistNames: {
            type: "array",
            items: { type: "string" },
            description:
              "Individual artist names participating in this act (split collaborations like 'A & B' into ['A', 'B']).",
          },
          subtitle: {
            type: "string",
            nullable: true,
            description:
              "Optional show format or premiere note (e.g. 'live AV', 'world premiere').",
          },
          day: {
            type: "string",
            nullable: true,
            description: "Optional performance day if listed (e.g. 'Friday 9 April').",
          },
          stage: {
            type: "string",
            nullable: true,
            description: "Optional stage or venue name if listed.",
          },
          setTime: {
            type: "string",
            nullable: true,
            description: "Optional start time in HH:MM format if listed.",
          },
        },
        required: ["billingName", "artistNames"],
      },
    },
  },
  required: ["entries"],
};

export async function extractLineupWithGemini(params: {
  text: string;
  sourceUrl: string;
  festivalName: string;
  festivalYear: number;
  apiKey: string;
  model: string;
}): Promise<ParsedLineupEntry[]> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  const response = await ai.interactions.create({
    model: params.model,
    store: false,
    system_instruction:
      "You extract structured music festival lineups from webpage text. Include only musical artists, bands, DJs, ensembles, and live acts on the festival lineup. Exclude navigation links, ticket tiers, sponsors, festival organizers, generic headings, and footer items. Preserve original artist spelling.",
    input: [
      `Festival: ${params.festivalName} (${params.festivalYear})`,
      `Source URL: ${params.sourceUrl}`,
      "",
      "Extract all announced artists/acts from the following webpage text:",
      params.text,
    ].join("\n"),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: GEMINI_LINEUP_JSON_SCHEMA,
    },
  });

  const rawText = response.output_text?.trim();
  if (!rawText) {
    throw new DomainError("Gemini devolvió una respuesta vacía al analizar el cartel");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new DomainError("Gemini devolvió JSON inválido al analizar el cartel");
  }

  const validated = geminiLineupResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new DomainError("La respuesta estructurada de Gemini no cumple el esquema esperado");
  }

  const normalized = validated.data.entries
    .map((entry) => normalizeExtractedEntry(entry))
    .filter((entry): entry is ParsedLineupEntry => entry !== null);

  return deduplicateEntries(normalized);
}

async function readLimitedText(response: Response): Promise<string> {
  if (response.url) {
    validateLineupSourceUrl(response.url);
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new DomainError("La página del cartel supera el tamaño máximo permitido (3 MB)");
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new DomainError("La página del cartel supera el tamaño máximo permitido (3 MB)");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new DomainError("La página del cartel supera el tamaño máximo permitido (3 MB)");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export async function fetchAndExtractFestivalLineup(
  rawUrl: string,
  options: FetchLineupSourceOptions,
): Promise<FetchLineupSourceResult> {
  const url = validateLineupSourceUrl(rawUrl);
  const fetchFn = options.fetchImpl ?? fetch;

  // 1. Clashfinder JSON source (deterministic & free)
  const clashfinderUrl = getClashfinderJsonUrl(url);
  if (clashfinderUrl) {
    const response = await fetchFn(clashfinderUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": LINEUP_FETCH_USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new DomainError(`No se pudo descargar Clashfinder (HTTP ${response.status})`);
    }
    const body = await readLimitedText(response);
    const contentHash = hashLineupContent(body);
    if (
      !options.force &&
      options.previousContentHash &&
      contentHash === options.previousContentHash
    ) {
      return { unchanged: true, contentHash, method: null, entries: [] };
    }
    let json: unknown;
    try {
      json = JSON.parse(body) as unknown;
    } catch {
      throw new DomainError("Clashfinder devolvió un archivo JSON inválido");
    }
    const entries = extractLineupFromClashfinderJson(json);
    if (entries.length === 0) {
      throw new DomainError("No se encontraron actuaciones en el archivo de Clashfinder");
    }
    return { unchanged: false, contentHash, method: "clashfinder", entries };
  }

  // 2. Standard HTTP fetch for official festival webpage or plain-text list
  const response = await fetchFn(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": LINEUP_FETCH_USER_AGENT,
      Accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new DomainError(`No se pudo descargar la web del cartel (HTTP ${response.status})`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = await readLimitedText(response);

  // Hash visible/normalized content so minor HTML noise or ads don't trigger unnecessary LLM calls
  const isPlainText =
    contentType.includes("text/plain") || url.pathname.toLowerCase().endsWith(".txt");
  const normalizedForHash = isPlainText ? body : htmlToCompactText(body);
  const contentHash = hashLineupContent(normalizedForHash || body);

  if (
    !options.force &&
    options.previousContentHash &&
    contentHash === options.previousContentHash
  ) {
    return { unchanged: true, contentHash, method: null, entries: [] };
  }

  // Layer 1a: Plain text list -> reuse deterministic lineup parser
  if (isPlainText) {
    const entries = deduplicateEntries(parseRawLineup(body));
    if (entries.length === 0) {
      throw new DomainError("No se detectaron artistas en el archivo de texto");
    }
    return { unchanged: false, contentHash, method: "plain-text", entries };
  }

  // Layer 1b: Embedded JSON-LD schema.org MusicEvent / MusicFestival performers (free)
  const jsonLdEntries = extractLineupFromJsonLd(body);
  if (jsonLdEntries.length > 0) {
    return { unchanged: false, contentHash, method: "json-ld", entries: jsonLdEntries };
  }

  // Layer 2: Universal structured extraction via Gemini API (optional, requires GEMINI_API_KEY)
  const apiKey = options.geminiApiKey?.trim();
  if (!apiKey) {
    throw new DomainError(
      "Esta web no incluye metadatos estructurados (JSON-LD). Configura GEMINI_API_KEY en el servidor para extraer el cartel automáticamente con IA.",
    );
  }

  if (!normalizedForHash || normalizedForHash.length < 20) {
    throw new DomainError(
      "La web del cartel no devolvió texto legible (puede requerir JavaScript en navegador).",
    );
  }

  const extractWithLlm = options.llmExtractor ?? extractLineupWithGemini;
  const entries = await extractWithLlm({
    text: normalizedForHash,
    sourceUrl: url.toString(),
    festivalName: options.festivalName,
    festivalYear: options.festivalYear,
    apiKey,
    model: options.geminiModel ?? "gemini-3.5-flash-lite",
  });

  if (entries.length === 0) {
    throw new DomainError("No se pudieron identificar artistas en la página del cartel");
  }

  return { unchanged: false, contentHash, method: "gemini", entries };
}
