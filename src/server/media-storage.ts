import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export { toMediaApiUrl } from "@/domain/media-url";

export type MediaBucket = "artists" | "albums";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function getMediaRootDir(overrideDir?: string): string {
  return path.resolve(
    /* turbopackIgnore: true */ overrideDir ?? process.env.MEDIA_DIR ?? "./data/media",
  );
}

/**
 * Resolves a relative media path inside MEDIA_DIR with strict path traversal protection.
 * Returns null if the path escapes the media root or contains invalid characters.
 */
export function resolveSafeMediaPath(relativePath: string, overrideDir?: string): string | null {
  if (!relativePath || relativePath.includes("\0")) {
    return null;
  }

  const root = getMediaRootDir(overrideDir);
  const normalizedInput = relativePath.replace(/^\/+/, "");
  const resolved = path.resolve(root, normalizedInput);

  if (!resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return resolved;
}

/** Returns the image MIME type for a known extension, or `null` for anything else. */
export function getServableMediaType(filePath: string): string | null {
  return EXT_TO_MIME[path.extname(filePath).toLowerCase()] ?? null;
}

export function getMediaContentType(filePath: string): string {
  return getServableMediaType(filePath) ?? "application/octet-stream";
}

function sanitizeBaseName(baseName: string): string {
  return baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "media";
}

/** Best-effort removal of a previously cached media file. Never throws. */
export async function deleteMediaFile(
  relativePath: string | null | undefined,
  mediaDir?: string,
): Promise<void> {
  if (!relativePath) {
    return;
  }
  const target = resolveSafeMediaPath(relativePath, mediaDir);
  if (!target) {
    return;
  }
  await rm(target, { force: true }).catch(() => undefined);
}

export interface DownloadMediaOptions {
  url: string;
  bucket: MediaBucket;
  baseName: string;
  mediaDir?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Downloads an image from an external URL, validates MIME type and max size (5 MB),
 * and writes it atomically (`tmp -> rename`) into
 * `<MEDIA_DIR>/<bucket>/<baseName>-<contentHash>.<ext>`.
 *
 * The content hash in the file name makes every distinct image a distinct URL, so the
 * `immutable` HTTP cache of `/api/media` never serves a stale photo after a re-sync.
 * Returns the relative path (e.g. `artists/art_1-3f9a0c1b2d.jpg`) or `null` on failure.
 */
export async function downloadAndSaveMedia(options: DownloadMediaOptions): Promise<string | null> {
  const { url, bucket, baseName, mediaDir, timeoutMs = 10_000, fetchImpl = fetch } = options;

  if (!URL.canParse(url) || !/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/*",
      },
    });

    if (!response.ok) {
      return null;
    }

    const rawContentType = response.headers.get("content-type") ?? "";
    const mime = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
    const ext = MIME_TO_EXT[mime];
    if (!ext) {
      return null;
    }

    const declaredSize = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const contentHash = createHash("sha256").update(buffer).digest("hex").slice(0, 10);
    const relativePath = `${bucket}/${sanitizeBaseName(baseName)}-${contentHash}${ext}`;
    const targetPath = resolveSafeMediaPath(relativePath, mediaDir);
    if (!targetPath) {
      return null;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;

    try {
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, targetPath);
    } catch (writeErr) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw writeErr;
    }

    return relativePath;
  } catch {
    return null;
  }
}
