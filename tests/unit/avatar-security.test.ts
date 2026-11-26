import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import {
  AVATAR_SIZE_PX,
  detectAllowedAvatarSignature,
  MAX_AVATAR_INPUT_BYTES,
  processAndSaveAvatar,
  resolveSafeMediaPath,
} from "@/server/media-storage";

describe("avatar security & optimization pipeline", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "kue-avatar-sec-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("re-encodes valid raster uploads to 256x256 WebP, strips EXIF metadata, and cleans up old avatars", async () => {
    const rawJpegWithExif = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: { r: 220, g: 40, b: 90 },
      },
    })
      .withExif({
        IFD0: {
          Artist: "Sensitive Author Name",
          ImageDescription: "Secret GPS Note",
        },
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    expect(detectAllowedAvatarSignature(rawJpegWithExif)).toBe("jpeg");

    const firstPath = await processAndSaveAvatar({
      buffer: rawJpegWithExif,
      userId: "user_abc",
      mediaDir: tempDir,
    });

    expect(firstPath).toMatch(/^avatars\/usr_user_abc-[a-f0-9]{10}\.webp$/);
    const savedFull = resolveSafeMediaPath(firstPath, tempDir);
    expect(savedFull).not.toBeNull();
    expect(existsSync(savedFull as string)).toBe(true);

    const savedBuffer = readFileSync(savedFull as string);
    const savedMeta = await sharp(savedBuffer).metadata();
    expect(savedMeta.format).toBe("webp");
    expect(savedMeta.width).toBe(AVATAR_SIZE_PX);
    expect(savedMeta.height).toBe(AVATAR_SIZE_PX);
    expect(savedMeta.exif).toBeUndefined();

    // Replace with a second distinct image and ensure the first file is deleted
    const secondPng = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 10, g: 200, b: 140, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const secondPath = await processAndSaveAvatar({
      buffer: secondPng,
      userId: "user_abc",
      previousAvatarPath: firstPath,
      mediaDir: tempDir,
    });

    expect(secondPath).not.toBe(firstPath);
    expect(existsSync(savedFull as string)).toBe(false);
    const secondFull = resolveSafeMediaPath(secondPath, tempDir);
    expect(existsSync(secondFull as string)).toBe(true);
  });

  it("rejects SVG, HTML/script payloads, GIFs, empty files, and oversized buffers", async () => {
    const svgXss = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );
    expect(detectAllowedAvatarSignature(svgXss)).toBeNull();
    await expect(
      processAndSaveAvatar({ buffer: svgXss, userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);

    const fakeGif = Buffer.from("GIF89a\x10\x00\x10\x00\x00\x00\x00;", "binary");
    expect(detectAllowedAvatarSignature(fakeGif)).toBeNull();
    await expect(
      processAndSaveAvatar({ buffer: fakeGif, userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);

    await expect(
      processAndSaveAvatar({ buffer: Buffer.alloc(0), userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);

    const oversized = Buffer.alloc(MAX_AVATAR_INPUT_BYTES + 1, 0xff);
    await expect(
      processAndSaveAvatar({ buffer: oversized, userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);
  });

  it("rejects decompression-bomb images exceeding the 16 MP pixel limit and tiny images", async () => {
    // 5000 x 4000 = 20,000,000 pixels (> 16,777,216 limit), yet compresses to < 30 KB PNG!
    const pixelBombPng = await sharp({
      create: {
        width: 5000,
        height: 4000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(pixelBombPng.byteLength).toBeLessThan(MAX_AVATAR_INPUT_BYTES);

    await expect(
      processAndSaveAvatar({ buffer: pixelBombPng, userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);

    const tooTinyPng = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      processAndSaveAvatar({ buffer: tooTinyPng, userId: "u1", mediaDir: tempDir }),
    ).rejects.toThrow(DomainError);
  });
});
