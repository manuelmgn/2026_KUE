import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { syncArtist } from "@/server/sync/sync-artist";

export const DEFAULT_RATE_LIMIT_MS = 1100;

export interface SyncQueueStatus {
  running: boolean;
  currentArtistId: string | null;
  pendingCount: number;
  processedCount: number;
  failedCount: number;
  totalEnqueued: number;
}

export interface SyncQueueOptions {
  minIntervalMs?: number;
  processor?: (artistId: string) => Promise<void>;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class SyncQueue {
  private readonly minIntervalMs: number;
  private readonly processor: (artistId: string) => Promise<void>;
  private readonly queue: string[] = [];
  private readonly queuedSet = new Set<string>();
  private running = false;
  private currentArtistId: string | null = null;
  private lastRunStartedAt: number | null = null;
  private processedCount = 0;
  private failedCount = 0;
  private totalEnqueued = 0;
  private drainPromise: Promise<void> | null = null;

  constructor(options: SyncQueueOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_RATE_LIMIT_MS;
    this.processor =
      options.processor ??
      (async (artistId: string) => {
        await syncArtist(artistId, { rateLimitMs: this.minIntervalMs });
      });
  }

  enqueue(artistId: string): boolean {
    if (!artistId || this.queuedSet.has(artistId) || this.currentArtistId === artistId) {
      return false;
    }

    this.queue.push(artistId);
    this.queuedSet.add(artistId);
    this.totalEnqueued += 1;
    this.kick();
    return true;
  }

  enqueueMany(artistIds: ReadonlyArray<string>): number {
    let added = 0;
    for (const id of artistIds) {
      if (this.enqueue(id)) {
        added += 1;
      }
    }
    return added;
  }

  getStatus(): SyncQueueStatus {
    return {
      running: this.running,
      currentArtistId: this.currentArtistId,
      pendingCount: this.queue.length,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      totalEnqueued: this.totalEnqueued,
    };
  }

  async waitUntilIdle(): Promise<void> {
    if (this.drainPromise) {
      await this.drainPromise;
    }
  }

  private kick(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.drainPromise = this.drain().finally(() => {
      this.running = false;
      this.currentArtistId = null;
      this.drainPromise = null;
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const nextId = this.queue.shift();
      if (!nextId) {
        break;
      }
      this.queuedSet.delete(nextId);

      if (this.lastRunStartedAt !== null) {
        const elapsed = Date.now() - this.lastRunStartedAt;
        const remaining = this.minIntervalMs - elapsed;
        if (remaining > 0) {
          await delay(remaining);
        }
      }

      this.currentArtistId = nextId;
      this.lastRunStartedAt = Date.now();

      try {
        await this.processor(nextId);
        this.processedCount += 1;
      } catch {
        this.failedCount += 1;
      } finally {
        this.currentArtistId = null;
      }
    }
  }
}

const globalForQueue = globalThis as typeof globalThis & {
  kueSyncQueue?: SyncQueue;
};

export function getSyncQueue(): SyncQueue {
  if (!globalForQueue.kueSyncQueue) {
    globalForQueue.kueSyncQueue = new SyncQueue();
  }
  return globalForQueue.kueSyncQueue;
}

export async function recoverPendingArtists(
  db: PrismaClient = getDb(),
  queue: SyncQueue = getSyncQueue(),
): Promise<number> {
  await db.artist.updateMany({
    where: { syncStatus: "SYNCING" },
    data: { syncStatus: "PENDING" },
  });

  const pending = await db.artist.findMany({
    where: { syncStatus: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return queue.enqueueMany(pending.map((artist) => artist.id));
}
