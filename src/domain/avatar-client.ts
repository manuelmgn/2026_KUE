const CLIENT_TARGET_PX = 512;
const CLIENT_MAX_RAW_BYTES = 12 * 1024 * 1024; // Allow pre-shrinking camera photos up to 12 MB in browser
const SERVER_MAX_RAW_BYTES = 4 * 1024 * 1024;

/**
 * Center-crops and downscales a user-selected image file in the browser to <=512x512 WebP
 * so uploads stay fast (~25-60 KB) even from mobile cameras. Falls back to the original file
 * if `<canvas>` or `createImageBitmap` is unavailable; server-side `sharp` still validates and
 * re-encodes every upload from scratch.
 */
export async function prepareAvatarUploadFile(file: File): Promise<File> {
  if (file.size > CLIENT_MAX_RAW_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    if (file.size > SERVER_MAX_RAW_BYTES) {
      throw new Error("FILE_TOO_LARGE");
    }
    return file;
  }

  // Never try to rasterize SVG/XML in browser; let server reject unsupported types cleanly
  const lowerType = file.type.toLowerCase();
  if (lowerType.includes("svg") || lowerType.includes("xml") || lowerType.includes("gif")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = Math.floor((bitmap.width - side) / 2);
      const sy = Math.floor((bitmap.height - side) / 2);
      const outSide = Math.min(side, CLIENT_TARGET_PX);

      const canvas = document.createElement("canvas");
      canvas.width = outSide;
      canvas.height = outSide;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }

      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outSide, outSide);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((res) => resolve(res), "image/webp", 0.88);
      });

      if (!blob || blob.size === 0 || blob.size > SERVER_MAX_RAW_BYTES) {
        if (file.size > SERVER_MAX_RAW_BYTES) {
          throw new Error("FILE_TOO_LARGE");
        }
        return file;
      }

      return new File([blob], "avatar.webp", { type: "image/webp" });
    } finally {
      bitmap.close();
    }
  } catch (err) {
    if (err instanceof Error && err.message === "FILE_TOO_LARGE") {
      throw err;
    }
    if (file.size > SERVER_MAX_RAW_BYTES) {
      throw new Error("FILE_TOO_LARGE");
    }
    return file;
  }
}
