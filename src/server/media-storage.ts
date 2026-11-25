import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

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
  return path.resolve(overrideDir ?? process.env.MEDIA_DIR ?? "./data/media");
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

export function getMediaContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export function toMediaApiUrl(relativePath: string | null): string | null {
  if (!relativePath) {
    return null;
  }
  const clean = relativePath.replace(/^\/+/, "");
  return `/api/media/${clean}`;
}

function sanitizeBaseName(baseName: string): string {
  return baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "media";
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
 * and writes it atomically (`tmp -> rename`) into `<MEDIA_DIR>/<bucket>/<baseName>.<ext>`.
 * Returns the relative path (e.g. `artists/art_1.jpg`) or `null` if download/validation fails.
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

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const declaredSize = Number(contentLengthHeader);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
        return null;
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const safeFileName = `${sanitizeBaseName(baseName)}${ext}`;
    const relativePath = `${bucket}/${safeFileName}`;
    const targetPath = resolveSafeMediaPath(relativePath, mediaDir);
    if (!targetPath) {
      return null;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.${randomBytes(6).toString("hex")}.tmp`;

    try {
      await writeFile(tmpPath, Buffer.from(arrayBuffer));
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
