import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_RATE_LIMIT_MS, recoverPendingArtists, SyncQueue } from "@/server/sync/queue";

describe("server/sync/queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces a strict >= 1100ms interval between sequential jobs and deduplicates", async () => {
    const timestamps: Array<{ id: string; at: number }> = [];
    const queue = new SyncQueue({
      minIntervalMs: DEFAULT_RATE_LIMIT_MS,
      processor: async (artistId) => {
        timestamps.push({ id: artistId, at: Date.now() });
      },
    });

    expect(queue.enqueue("a1")).toBe(true);
    expect(queue.enqueue("a1")).toBe(false); // duplicate while running
    expect(queue.enqueue("a2")).toBe(true);
    expect(queue.enqueue("a2")).toBe(false); // duplicate while queued
    expect(queue.enqueue("a3")).toBe(true);

    const idle = queue.waitUntilIdle();
    await vi.runAllTimersAsync();
    await idle;

    expect(timestamps.map((t) => t.id)).toEqual(["a1", "a2", "a3"]);
    const [t0, t1, t2] = timestamps;
    if (!t0 || !t1 || !t2) {
      throw new Error("Expected 3 timestamps");
    }
    expect(t1.at - t0.at).toBeGreaterThanOrEqual(1100);
    expect(t2.at - t1.at).toBeGreaterThanOrEqual(1100);

    const status = queue.getStatus();
    expect(status.running).toBe(false);
    expect(status.processedCount).toBe(3);
    expect(status.failedCount).toBe(0);
  });

  it("continues processing remaining artists when one artist fails", async () => {
    const processed: string[] = [];
    const queue = new SyncQueue({
      minIntervalMs: 1100,
      processor: async (artistId) => {
        if (artistId === "bad") {
          throw new Error("MusicBrainz 503");
        }
        processed.push(artistId);
      },
    });

    queue.enqueueMany(["good-1", "bad", "good-2"]);
    const idle = queue.waitUntilIdle();
    await vi.runAllTimersAsync();
    await idle;

    expect(processed).toEqual(["good-1", "good-2"]);
    expect(queue.getStatus().processedCount).toBe(2);
    expect(queue.getStatus().failedCount).toBe(1);
  });

  it("recovers SYNCING and PENDING artists on boot", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ id: "art-1" }, { id: "art-2" }]);
    const mockDb = {
      artist: { updateMany, findMany },
    } as unknown as PrismaClient;

    const seen: string[] = [];
    const queue = new SyncQueue({
      minIntervalMs: 1100,
      processor: async (id) => {
        seen.push(id);
      },
    });

    const count = await recoverPendingArtists(mockDb, queue);
    expect(count).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { syncStatus: "SYNCING" },
      data: { syncStatus: "PENDING" },
    });

    const idle = queue.waitUntilIdle();
    await vi.runAllTimersAsync();
    await idle;
    expect(seen).toEqual(["art-1", "art-2"]);
  });
});
