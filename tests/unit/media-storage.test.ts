import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  deleteMediaFile,
  downloadAndSaveMedia,
  getMediaContentType,
  getServableMediaType,
  getVercelBlobAccess,
  isVercelBlobEnabled,
  readMediaFile,
  resolveSafeMediaPath,
  toMediaApiUrl,
} from "@/server/media-storage";

const server = setupServer();
let tempDir = "";

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  tempDir = await mkdtemp(path.join(os.tmpdir(), "kue-media-test-"));
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("server/media-storage", () => {
  it("blocks path traversal and resolves valid relative paths strictly inside MEDIA_DIR", () => {
    expect(resolveSafeMediaPath("../../etc/passwd", tempDir)).toBeNull();
    expect(resolveSafeMediaPath("../outside.jpg", tempDir)).toBeNull();
    expect(resolveSafeMediaPath("artists/../../secret", tempDir)).toBeNull();
    expect(resolveSafeMediaPath("", tempDir)).toBeNull();

    const valid = resolveSafeMediaPath("artists/tim.jpg", tempDir);
    expect(valid).toBe(path.join(tempDir, "artists", "tim.jpg"));
    expect(getMediaContentType("artists/tim.jpg")).toBe("image/jpeg");
    expect(toMediaApiUrl("artists/tim.jpg")).toBe("/api/media/artists/tim.jpg");
  });

  it("downloads and saves valid JPEG images atomically in MEDIA_DIR", async () => {
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    server.use(
      http.get(
        "https://cdn.deezer.com/artist.jpg",
        () =>
          new HttpResponse(fakeJpeg, {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          }),
      ),
    );

    const savedRel = await downloadAndSaveMedia({
      url: "https://cdn.deezer.com/artist.jpg",
      bucket: "artists",
      baseName: "art_123",
      mediaDir: tempDir,
    });

    expect(savedRel).toMatch(/^artists\/art_123-[a-f0-9]{10}\.jpg$/);
    if (!savedRel) {
      throw new Error("Expected savedRel");
    }
    const savedPath = resolveSafeMediaPath(savedRel, tempDir);
    if (!savedPath) {
      throw new Error("Expected valid savedPath");
    }
    const contents = await readFile(savedPath);
    expect(new Uint8Array(contents)).toEqual(fakeJpeg);

    expect(getServableMediaType(savedPath)).toBe("image/jpeg");
    expect(getServableMediaType("artists/art_123.tmp")).toBeNull();

    await deleteMediaFile(savedRel, tempDir);
    await expect(readFile(savedPath)).rejects.toThrow();
  });

  it("reads local media files via readMediaFile and rejects unsafe or missing paths", async () => {
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    server.use(
      http.get(
        "https://cdn.deezer.com/cover.png",
        () =>
          new HttpResponse(fakePng, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
      ),
    );

    const savedRel = await downloadAndSaveMedia({
      url: "https://cdn.deezer.com/cover.png",
      bucket: "albums",
      baseName: "alb_1",
      mediaDir: tempDir,
    });
    expect(savedRel).toBeTruthy();

    const loaded = await readMediaFile(savedRel as string, tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.contentType).toBe("image/png");
    expect(loaded?.contentLength).toBe(fakePng.byteLength);
    expect(new Uint8Array(loaded?.body as Buffer)).toEqual(fakePng);

    expect(await readMediaFile("../../etc/passwd", tempDir)).toBeNull();
    expect(await readMediaFile("albums/missing.png", tempDir)).toBeNull();
    expect(await readMediaFile("albums/file.txt", tempDir)).toBeNull();
  });

  it("detects Vercel Blob mode and access level cleanly", () => {
    const prevToken = process.env.BLOB_READ_WRITE_TOKEN;
    const prevStoreId = process.env.BLOB_STORE_ID;
    const prevAccess = process.env.BLOB_ACCESS;

    try {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      delete process.env.BLOB_ACCESS;

      expect(isVercelBlobEnabled()).toBe(false);
      expect(getVercelBlobAccess()).toBe("private");

      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      expect(isVercelBlobEnabled()).toBe(true);
      expect(isVercelBlobEnabled(tempDir)).toBe(false);

      delete process.env.BLOB_READ_WRITE_TOKEN;
      process.env.BLOB_STORE_ID = "store_123";
      expect(isVercelBlobEnabled()).toBe(true);

      process.env.BLOB_ACCESS = "public";
      expect(getVercelBlobAccess()).toBe("public");
    } finally {
      if (prevToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = prevToken;

      if (prevStoreId === undefined) delete process.env.BLOB_STORE_ID;
      else process.env.BLOB_STORE_ID = prevStoreId;

      if (prevAccess === undefined) delete process.env.BLOB_ACCESS;
      else process.env.BLOB_ACCESS = prevAccess;
    }
  });

  it("rejects non-image MIME types and oversized payloads", async () => {
    server.use(
      http.get(
        "https://cdn.deezer.com/not-image.html",
        () =>
          new HttpResponse("<html>oops</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
      http.get(
        "https://cdn.deezer.com/huge.png",
        () =>
          new HttpResponse(new Uint8Array(10), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Content-Length": String(6 * 1024 * 1024),
            },
          }),
      ),
    );

    expect(
      await downloadAndSaveMedia({
        url: "https://cdn.deezer.com/not-image.html",
        bucket: "artists",
        baseName: "bad_mime",
        mediaDir: tempDir,
      }),
    ).toBeNull();

    expect(
      await downloadAndSaveMedia({
        url: "https://cdn.deezer.com/huge.png",
        bucket: "albums",
        baseName: "too_big",
        mediaDir: tempDir,
      }),
    ).toBeNull();
  });
});
