import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DomainError } from "@/domain/errors";

export { toMediaApiUrl } from "@/domain/media-url";

export type MediaBucket = "artists" | "albums" | "avatars";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_AVATAR_INPUT_BYTES = 4 * 1024 * 1024; // 4 MB raw upload hard limit
export const MAX_AVATAR_OUTPUT_BYTES = 150 * 1024; // 150 KB post-reencode limit
export const MAX_AVATAR_PIXELS = 16_777_216; // 16 MP (4096x4096) anti-pixel-bomb limit
export const AVATAR_SIZE_PX = 256;
export const MIN_AVATAR_DIMENSION_PX = 16;

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

export function isVercelBlobEnabled(overrideMediaDir?: string): boolean {
  if (overrideMediaDir?.trim()) {
    return false;
  }
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim());
}

export function getVercelBlobAccess(): "private" | "public" {
  return process.env.BLOB_ACCESS?.trim().toLowerCase() === "public" ? "public" : "private";
}

function toNormalizedMediaKey(safeAbsolutePath: string, overrideDir?: string): string {
  const root = getMediaRootDir(overrideDir);
  return path.relative(root, safeAbsolutePath).split(path.sep).join("/");
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

async function writeMediaBuffer(
  relativePath: string,
  buffer: Buffer,
  contentType: string,
  mediaDir?: string,
): Promise<void> {
  const targetPath = resolveSafeMediaPath(relativePath, mediaDir);
  if (!targetPath) {
    throw new DomainError("Ruta de almacenamiento no válida");
  }

  if (isVercelBlobEnabled(mediaDir)) {
    const normalizedKey = toNormalizedMediaKey(targetPath, mediaDir);
    const { put } = await import("@vercel/blob");
    await put(normalizedKey, buffer, {
      access: getVercelBlobAccess(),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
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
}

export interface ServableMediaResult {
  body: Buffer | ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
}

/**
 * Reads a validated media asset from Vercel Blob (when configured) or local `MEDIA_DIR`.
 * Returns `null` for unsafe paths, non-image extensions, or missing files.
 */
export async function readMediaFile(
  relativePath: string,
  mediaDir?: string,
): Promise<ServableMediaResult | null> {
  const safePath = resolveSafeMediaPath(relativePath, mediaDir);
  if (!safePath) {
    return null;
  }

  const contentType = getServableMediaType(safePath);
  if (!contentType) {
    return null;
  }

  if (isVercelBlobEnabled(mediaDir)) {
    const normalizedKey = toNormalizedMediaKey(safePath, mediaDir);
    const { get } = await import("@vercel/blob");
    const result = await get(normalizedKey, { access: getVercelBlobAccess() });
    if (result?.statusCode !== 200 || !result.stream) {
      return null;
    }
    return {
      body: result.stream,
      contentType: result.blob.contentType || contentType,
      ...(typeof result.blob.size === "number" ? { contentLength: result.blob.size } : {}),
    };
  }

  try {
    const fileBuffer = await readFile(/* turbopackIgnore: true */ safePath);
    return {
      body: fileBuffer,
      contentType,
      contentLength: fileBuffer.byteLength,
    };
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "EISDIR") {
      return null;
    }
    throw error;
  }
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
  if (isVercelBlobEnabled(mediaDir)) {
    const normalizedKey = toNormalizedMediaKey(target, mediaDir);
    const { del } = await import("@vercel/blob");
    await del(normalizedKey).catch(() => undefined);
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
    await writeMediaBuffer(relativePath, buffer, mime, mediaDir);

    return relativePath;
  } catch {
    return null;
  }
}

export type AllowedAvatarInputFormat = "jpeg" | "png" | "webp";

/**
 * Inspects true binary magic bytes (ignoring user-supplied filename and Content-Type)
 * so SVG, HTML, XML, GIF, scripts, or polyglot files with non-raster headers are rejected
 * before reaching any decoder.
 */
export function detectAllowedAvatarSignature(buffer: Buffer): AllowedAvatarInputFormat | null {
  if (buffer.byteLength < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export interface ProcessAndSaveAvatarOptions {
  buffer: Buffer;
  userId: string;
  previousAvatarPath?: string | null;
  mediaDir?: string;
}

/**
 * Validates, sanitizes, and re-encodes an uploaded avatar image from scratch:
 * 1. Enforces strict 4 MB raw byte limit and raster magic-byte signature (JPEG/PNG/WebP only).
 * 2. Caps decoded pixel budget at 16 MP (`limitInputPixels`) and rejects animated images.
 * 3. Auto-orients via EXIF, crops square 256x256, and re-encodes to clean WebP stripping
 *    all EXIF/GPS/XMP/ICC metadata and trailing binary payloads.
 * 4. Writes atomically into `<MEDIA_DIR>/avatars/` and removes any previous avatar file.
 */
export async function processAndSaveAvatar(options: ProcessAndSaveAvatarOptions): Promise<string> {
  const { buffer, userId, previousAvatarPath, mediaDir } = options;

  if (!buffer || buffer.byteLength === 0) {
    throw new DomainError("El archivo de imagen está vacío");
  }

  if (buffer.byteLength > MAX_AVATAR_INPUT_BYTES) {
    throw new DomainError("La imagen supera el tamaño máximo permitido (4 MB)");
  }

  const signature = detectAllowedAvatarSignature(buffer);
  if (!signature) {
    throw new DomainError("Formato de imagen no permitido. Usa JPEG, PNG o WebP estático.");
  }

  let cleanWebp: Buffer;
  try {
    const decoder = sharp(buffer, {
      limitInputPixels: MAX_AVATAR_PIXELS,
      sequentialRead: true,
      animated: false,
      failOn: "error",
    });

    const meta = await decoder.metadata();
    if (
      !meta.format ||
      (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp")
    ) {
      throw new DomainError("Formato de imagen no válido");
    }

    if ((meta.pages ?? 1) > 1) {
      throw new DomainError("No se permiten imágenes animadas como avatar");
    }

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < MIN_AVATAR_DIMENSION_PX || height < MIN_AVATAR_DIMENSION_PX) {
      throw new DomainError(
        `La imagen es demasiado pequeña (mínimo ${MIN_AVATAR_DIMENSION_PX}×${MIN_AVATAR_DIMENSION_PX} px)`,
      );
    }
    if (width * height > MAX_AVATAR_PIXELS) {
      throw new DomainError("Las dimensiones de la imagen superan el límite de seguridad");
    }

    cleanWebp = await sharp(buffer, {
      limitInputPixels: MAX_AVATAR_PIXELS,
      sequentialRead: true,
      animated: false,
      failOn: "error",
    })
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (err: unknown) {
    if (err instanceof DomainError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("pixel limit")) {
      throw new DomainError("Las dimensiones de la imagen superan el límite de seguridad");
    }
    throw new DomainError("No se pudo procesar la imagen. Asegúrate de subir un archivo válido.");
  }

  if (cleanWebp.byteLength === 0 || cleanWebp.byteLength > MAX_AVATAR_OUTPUT_BYTES) {
    throw new DomainError("La imagen procesada supera el tamaño máximo permitido");
  }

  const contentHash = createHash("sha256").update(cleanWebp).digest("hex").slice(0, 10);
  const relativePath = `avatars/usr_${sanitizeBaseName(userId)}-${contentHash}.webp`;
  await writeMediaBuffer(relativePath, cleanWebp, "image/webp", mediaDir);

  if (previousAvatarPath && previousAvatarPath !== relativePath) {
    await deleteMediaFile(previousAvatarPath, mediaDir);
  }

  return relativePath;
}
