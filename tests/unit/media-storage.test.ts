import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  downloadAndSaveMedia,
  getMediaContentType,
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

    expect(savedRel).toBe("artists/art_123.jpg");
    if (!savedRel) {
      throw new Error("Expected savedRel");
    }
    const savedPath = resolveSafeMediaPath(savedRel, tempDir);
    if (!savedPath) {
      throw new Error("Expected valid savedPath");
    }
    const contents = await readFile(savedPath);
    expect(new Uint8Array(contents)).toEqual(fakeJpeg);
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
