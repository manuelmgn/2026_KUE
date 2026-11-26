import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { normalizeArtistName } from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import { type ParsedLineupEntry, parseRawLineup } from "@/domain/lineup-parser";

const FETCH_TIMEOUT_MS = 20_000;
const FETCH_RETRY_DELAY_MS = 300;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_TEXT_FOR_LLM_CHARS = 80_000;
const MAX_EMBEDDED_SCRIPT_CHARS = 60_000;
const LINEUP_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type LineupExtractionMethod =
  | "clashfinder"
  | "json-ld"
  | "embedded-json"
  | "plain-text"
  | "gemini";

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

const IGNORED_EMBEDDED_KEYS = new Set([
  "media",
  "image",
  "images",
  "img",
  "photo",
  "photos",
  "thumbnail",
  "thumbnails",
  "icon",
  "icons",
  "svg",
  "menu",
  "menus",
  "navigation",
  "nav",
  "footer",
  "cookie",
  "cookies",
  "consent",
  "partner",
  "partners",
  "sponsor",
  "sponsors",
  "linklist",
  "tracking",
  "analytics",
  "seo",
  "meta",
  "og",
  "twitter",
  "css",
  "style",
  "styles",
  "classes",
  "classname",
  "longitude",
  "latitude",
  "lat",
  "lng",
  "zip",
  "phone",
  "email",
  "linkmap",
  "small_uri",
  "large_uri",
  "uri",
  "src",
  "srcset",
  "width",
  "height",
  "dimensions",
  "alt",
  "copyright",
  "edit",
  "zoom",
  "background",
  "space_before",
  "frame_class",
  "background_color_class",
  "header_layout",
  "header_link",
  "header_link_target",
  "header_link_text",
  "ticket_sold_out",
  "ticket_free_event",
  "ticket_no_presale",
  "ticket_sold_out_label",
  "ticket_overview_text",
  "ticket_text",
  "ticket_link",
  "ticket_link_text",
  "ticket_link_target",
  "alphaid",
  "uid",
  "id",
  "slug",
  "link",
  "url",
  "href",
  "path",
  "permalink",
]);

function pruneEmbeddedJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 14 || value === null || value === undefined || typeof value === "boolean") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 1900 && value <= 2100 ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed.length > 240) {
      return undefined;
    }
    if (/^(?:https?:\/\/|\/\/|data:|\/(?:_assets|fileadmin|wp-content|static)\/)/i.test(trimmed)) {
      return undefined;
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      const pruned = pruneEmbeddedJsonValue(item, depth + 1);
      if (pruned !== undefined) {
        items.push(pruned);
      }
      if (items.length >= 600) {
        break;
      }
    }
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let kept = 0;
    for (const [key, val] of Object.entries(record)) {
      if (IGNORED_EMBEDDED_KEYS.has(key.toLowerCase())) {
        continue;
      }
      const pruned = pruneEmbeddedJsonValue(val, depth + 1);
      if (pruned !== undefined) {
        out[key] = pruned;
        kept += 1;
      }
    }
    return kept > 0 ? out : undefined;
  }
  return undefined;
}

function extractBalancedJsonSlice(source: string, openIndex: number): string | null {
  const openChar = source[openIndex];
  const closeChar = openChar === "{" ? "}" : openChar === "[" ? "]" : null;
  if (!closeChar) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, i + 1);
      }
    }
  }
  return null;
}

function parseNuxtIifeParamMap(script: string): Map<string, string> {
  const map = new Map<string, string>();
  const fnMatch = script.match(/window\.__NUXT__\s*=\s*\(\s*function\s*\(([^)]*)\)\s*\{/);
  if (!fnMatch?.[1]) {
    return map;
  }
  const params = fnMatch[1]
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (params.length === 0) {
    return map;
  }

  // Locate the trailing argument list `}(arg1,arg2,...))`
  const callOpenIdx = script.lastIndexOf("}(");
  if (callOpenIdx === -1) {
    return map;
  }
  const argsSection = script.slice(callOpenIdx + 2);
  const args: string[] = [];
  let i = 0;
  while (i < argsSection.length && args.length < params.length) {
    while (i < argsSection.length && /[\s,]/.test(argsSection[i] ?? "")) {
      i += 1;
    }
    const ch = argsSection[i];
    if (!ch || ch === ")") {
      break;
    }
    if (ch === '"') {
      let end = i + 1;
      let esc = false;
      while (end < argsSection.length) {
        const c = argsSection[end];
        if (esc) {
          esc = false;
        } else if (c === "\\") {
          esc = true;
        } else if (c === '"') {
          break;
        }
        end += 1;
      }
      const rawLiteral = argsSection.slice(i, end + 1);
      try {
        const decoded = JSON.parse(rawLiteral) as unknown;
        args.push(typeof decoded === "string" ? decoded : "");
      } catch {
        args.push("");
      }
      i = end + 1;
    } else {
      let end = i;
      while (end < argsSection.length && argsSection[end] !== "," && argsSection[end] !== ")") {
        end += 1;
      }
      args.push(argsSection.slice(i, end).trim());
      i = end;
    }
  }

  for (let idx = 0; idx < Math.min(params.length, args.length); idx += 1) {
    const key = params[idx];
    const val = args[idx];
    if (key && val && val !== "null" && val !== "void 0" && val !== "true" && val !== "false") {
      map.set(key, val);
    }
  }
  return map;
}

function decodeJsStringLiteral(rawContent: string): string | null {
  try {
    const parsed = JSON.parse(`"${rawContent}"`) as unknown;
    return typeof parsed === "string" ? parsed.replace(/\s+/g, " ").trim() : null;
  } catch {
    return rawContent.replace(/\s+/g, " ").trim() || null;
  }
}

const JS_DATA_FIELD_REGEX =
  /\b(title|name|artist|artistName|artists|performer|subtitle|header|header_sub|day|date|date_tag|startDate|startDateOnly|time|startTime|stage|venue|location|category)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_$][A-Za-z0-9_$]{0,3})\b)/g;

function extractKeyValuePairsFromJsScript(script: string): string {
  const paramMap = script.includes("window.__NUXT__")
    ? parseNuxtIifeParamMap(script)
    : new Map<string, string>();
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const match of script.matchAll(JS_DATA_FIELD_REGEX)) {
    const key = match[1];
    const rawStr = match[2];
    const ident = match[3];
    if (!key) {
      continue;
    }

    let value: string | null = null;
    if (rawStr !== undefined) {
      value = decodeJsStringLiteral(rawStr);
    } else if (ident && paramMap.has(ident)) {
      value = paramMap.get(ident) ?? null;
    }

    if (!value || value.length > 200) {
      continue;
    }
    if (/^(?:https?:\/\/|\/\/|data:|\/)/i.test(value)) {
      continue;
    }
    const line = `${key}: ${value}`;
    if (key === "title" || key === "name" || key === "artist" || key === "header") {
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
    }
    lines.push(line);
    if (lines.length >= 1200) {
      break;
    }
  }

  return lines.join("\n");
}

/**
 * Safely extracts structured lineup data embedded in `<script>` tags (Nuxt, Next.js, Vue, etc.)
 * without executing any untrusted JavaScript.
 */
export function extractEmbeddedScriptDataText(html: string): string {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const sections: string[] = [];
  let totalChars = 0;

  for (const match of html.matchAll(scriptRegex)) {
    const attrs = match[1] ?? "";
    const content = match[2]?.trim() ?? "";
    if (!content || /\bsrc\s*=/i.test(attrs)) {
      continue;
    }
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) {
      continue;
    }

    let extracted = "";
    const isJsonScript =
      /type\s*=\s*["']application\/json["']/i.test(attrs) ||
      /\bid\s*=\s*["'](?:__NEXT_DATA__|__NUXT_DATA__)["']/i.test(attrs);
    if (!isJsonScript && content.length < 100) {
      continue;
    }

    if (isJsonScript) {
      try {
        const parsed = JSON.parse(content) as unknown;
        const pruned = pruneEmbeddedJsonValue(parsed);
        if (pruned !== undefined) {
          extracted = JSON.stringify(pruned);
        }
      } catch {
        // Fall through if malformed
      }
    } else if (
      /(?:var|let|const|window\.)\s*[A-Za-z0-9_.$]+\s*=\s*[{[]/.test(content) &&
      !content.includes("window.__NUXT__")
    ) {
      const assignMatch = content.match(
        /(?:var|let|const|window\.)\s*[A-Za-z0-9_.$]+\s*=\s*([{[])/,
      );
      if (assignMatch && assignMatch.index !== undefined) {
        const openIdx = content.indexOf(assignMatch[1] ?? "{", assignMatch.index);
        const jsonSlice = openIdx >= 0 ? extractBalancedJsonSlice(content, openIdx) : null;
        if (jsonSlice) {
          try {
            const parsed = JSON.parse(jsonSlice) as unknown;
            const pruned = pruneEmbeddedJsonValue(parsed);
            if (pruned !== undefined) {
              extracted = JSON.stringify(pruned);
            }
          } catch {
            // Not strict JSON; try JS key-value extraction below
          }
        }
      }
    }

    if (
      !extracted &&
      (content.includes("window.__NUXT__") ||
        (content.length >= 2_000 && /\b(?:title|artist|performer|lineup)\s*:/i.test(content)))
    ) {
      extracted = extractKeyValuePairsFromJsScript(content);
    }

    if (extracted.length >= 40) {
      const remaining = MAX_EMBEDDED_SCRIPT_CHARS - totalChars;
      if (remaining <= 0) {
        break;
      }
      const chunk = extracted.slice(0, remaining);
      sections.push(chunk);
      totalChars += chunk.length;
    }
  }

  return sections.join("\n");
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

function pickLocalizedLabel(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    for (const key of ["en", "es", "pt", "ca", "gl"]) {
      const val = rec[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.replace(/\s+/g, " ").trim();
      }
    }
    for (const val of Object.values(rec)) {
      if (typeof val === "string" && val.trim().length > 0) {
        return val.replace(/\s+/g, " ").trim();
      }
    }
  }
  return null;
}

function splitBlockDayAndStage(label: string | null): { day: string | null; stage: string | null } {
  if (!label) {
    return { day: null, stage: null };
  }
  const parts = label
    .split(/\s*[·|•]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      day: parts[0] ?? null,
      stage: parts.slice(1).join(" · ") || null,
    };
  }
  return { day: label, stage: null };
}

/**
 * Deterministically extracts structured festival lineups from embedded page hydration JSON
 * (e.g. Primavera Sound `window.__INITIAL_DATA__` `LineupList` blocks / `artistSets`)
 * without executing JavaScript or calling an LLM.
 */
export function extractLineupFromEmbeddedJson(html: string): ParsedLineupEntry[] {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const collected: ParsedLineupEntry[] = [];

  const collectArtistObjects = (
    items: unknown,
    ctx: { day: string | null; stage: string | null },
  ) => {
    if (!Array.isArray(items)) {
      return;
    }
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const rec = item as Record<string, unknown>;
      const rawName =
        typeof rec.artistName === "string"
          ? rec.artistName
          : typeof rec.artist_name === "string"
            ? rec.artist_name
            : null;
      if (!rawName?.trim()) {
        continue;
      }
      const itemDay = pickLocalizedLabel(rec.day ?? rec.date) ?? ctx.day;
      const itemStage = pickLocalizedLabel(rec.stage ?? rec.venue) ?? ctx.stage;
      const itemTime = typeof rec.time === "string" ? rec.time.trim() || null : null;
      const normalized = normalizeExtractedEntry({
        billingName: rawName,
        day: itemDay,
        stage: itemStage,
        setTime: itemTime,
      });
      if (normalized) {
        collected.push(normalized);
      }
    }
  };

  const visit = (node: unknown, depth = 0) => {
    if (depth > 16 || !node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
      }
      return;
    }
    const rec = node as Record<string, unknown>;
    const nodeType = typeof rec.type === "string" ? rec.type : "";
    if (nodeType === "LineupList" || Array.isArray(rec.artistSets)) {
      if (Array.isArray(rec.artistSets)) {
        collectArtistObjects(rec.artistSets, { day: null, stage: null });
      }
      if (Array.isArray(rec.blocks)) {
        for (const block of rec.blocks) {
          if (!block || typeof block !== "object" || Array.isArray(block)) {
            continue;
          }
          const blockRec = block as Record<string, unknown>;
          const blockLabel = pickLocalizedLabel(blockRec.title ?? blockRec.name ?? blockRec.day);
          const ctx = splitBlockDayAndStage(blockLabel);
          collectArtistObjects(blockRec.artists ?? blockRec.artistSets, ctx);
        }
      }
    }

    for (const val of Object.values(rec)) {
      if (val && typeof val === "object") {
        visit(val, depth + 1);
      }
    }
  };

  for (const match of html.matchAll(scriptRegex)) {
    const attrs = match[1] ?? "";
    const content = match[2]?.trim() ?? "";
    if (!content || /\bsrc\s*=/i.test(attrs)) {
      continue;
    }
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) {
      continue;
    }

    let parsed: unknown = null;
    const isJsonScript =
      /type\s*=\s*["']application\/json["']/i.test(attrs) ||
      /\bid\s*=\s*["'](?:__NEXT_DATA__|__NUXT_DATA__)["']/i.test(attrs);

    if (isJsonScript) {
      try {
        parsed = JSON.parse(content) as unknown;
      } catch {
        parsed = null;
      }
    } else if (
      /(?:var|let|const|window\.)\s*[A-Za-z0-9_.$]+\s*=\s*[{[]/.test(content) &&
      !content.includes("window.__NUXT__")
    ) {
      const assignMatch = content.match(
        /(?:var|let|const|window\.)\s*[A-Za-z0-9_.$]+\s*=\s*([{[])/,
      );
      if (assignMatch && assignMatch.index !== undefined) {
        const openIdx = content.indexOf(assignMatch[1] ?? "{", assignMatch.index);
        const jsonSlice = openIdx >= 0 ? extractBalancedJsonSlice(content, openIdx) : null;
        if (jsonSlice) {
          try {
            parsed = JSON.parse(jsonSlice) as unknown;
          } catch {
            parsed = null;
          }
        }
      }
    }

    if (parsed) {
      visit(parsed);
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
      "You extract structured music festival lineups from webpage text and/or embedded structured page data (JSON or key-value fields). Include only musical artists, bands, DJs, ensembles, and live acts on the festival lineup. Exclude navigation links, ticket tiers, sponsors, festival organizers, generic headings, films/talks/workshops unless musical performances, and footer items. Preserve original artist spelling.",
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

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "error de red desconocido";
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as { code?: unknown; message?: unknown };
    if (typeof causeRecord.code === "string" && causeRecord.code.trim()) {
      return causeRecord.code.trim();
    }
    if (typeof causeRecord.message === "string" && causeRecord.message.trim()) {
      return causeRecord.message.trim();
    }
  }
  return error.message || "error de red";
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return false;
  }
  return true;
}

async function fetchLineupResponse(
  fetchFn: typeof fetch,
  url: string,
  accept: string,
): Promise<Response> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchFn(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": LINEUP_FETCH_USER_AGENT,
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        },
      });
    } catch (error: unknown) {
      lastError = error;
      if (attempt < maxAttempts && isRetryableFetchError(error)) {
        await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
        continue;
      }
      break;
    }
  }

  throw new DomainError(
    `No se pudo conectar con la web del cartel (${describeFetchError(lastError)})`,
  );
}

function combineVisibleAndEmbeddedText(visibleText: string, embeddedDataText: string): string {
  if (!embeddedDataText) {
    return visibleText.slice(0, MAX_TEXT_FOR_LLM_CHARS);
  }
  if (!visibleText) {
    return embeddedDataText.slice(0, MAX_TEXT_FOR_LLM_CHARS);
  }

  const separator = "\n\n--- EMBEDDED PAGE DATA ---\n";
  if (visibleText.length + separator.length + embeddedDataText.length <= MAX_TEXT_FOR_LLM_CHARS) {
    return `${visibleText}${separator}${embeddedDataText}`;
  }

  const visibleBudget = Math.min(visibleText.length, Math.floor(MAX_TEXT_FOR_LLM_CHARS * 0.4));
  const embeddedBudget = MAX_TEXT_FOR_LLM_CHARS - visibleBudget - separator.length;
  return `${visibleText.slice(0, visibleBudget)}${separator}${embeddedDataText.slice(0, embeddedBudget)}`;
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
    const response = await fetchLineupResponse(fetchFn, clashfinderUrl, "application/json");
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
  const response = await fetchLineupResponse(
    fetchFn,
    url.toString(),
    "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.8",
  );

  if (!response.ok) {
    throw new DomainError(`No se pudo descargar la web del cartel (HTTP ${response.status})`);
  }
  if (response.url) {
    validateLineupSourceUrl(response.url);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = await readLimitedText(response);

  // Hash visible + embedded structured content so minor HTML noise or ads don't trigger unnecessary LLM calls
  // while updates inside hydration payloads (Nuxt/Vue/Next.js) are still detected.
  const isPlainText =
    contentType.includes("text/plain") || url.pathname.toLowerCase().endsWith(".txt");
  const visibleText = isPlainText ? body : htmlToCompactText(body);
  const embeddedDataText = isPlainText ? "" : extractEmbeddedScriptDataText(body);
  const normalizedForHash = isPlainText
    ? body
    : combineVisibleAndEmbeddedText(visibleText, embeddedDataText);
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

  // Layer 1c: Structured hydration JSON payloads (e.g. Primavera Sound LineupList blocks) (free)
  const embeddedJsonEntries = extractLineupFromEmbeddedJson(body);
  if (embeddedJsonEntries.length > 0) {
    return {
      unchanged: false,
      contentHash,
      method: "embedded-json",
      entries: embeddedJsonEntries,
    };
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
