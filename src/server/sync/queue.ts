import { getDeadline, waitUntil } from "@vercel/functions";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { syncArtist } from "@/server/sync/sync-artist";

export const DEFAULT_RATE_LIMIT_MS = 1100;
const VERCEL_DRAIN_SAFETY_MARGIN_MS = 15_000;

export interface SyncQueueStatus {
  running: boolean;
  disabled: boolean;
  currentArtistId: string | null;
  pendingCount: number;
  processedCount: number;
  failedCount: number;
  totalEnqueued: number;
}

export interface SyncQueueOptions {
  minIntervalMs?: number;
  processor?: (artistId: string) => Promise<void>;
  /** When true, `enqueue` is a no-op (used by E2E runs to avoid hitting real external APIs). */
  disabled?: boolean;
}

export interface EnqueueOptions {
  /**
   * Re-run the artist after the in-flight job finishes if it is currently being processed.
   * Needed when the artist's identity changed mid-sync (e.g. manual disambiguation).
   */
  rerunIfActive?: boolean;
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
  private readonly disabled: boolean;
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
    this.disabled = options.disabled ?? false;
    this.processor = options.processor ?? ((artistId: string) => syncArtist(artistId));
  }

  enqueue(artistId: string, options: EnqueueOptions = {}): boolean {
    if (this.disabled || !artistId || this.queuedSet.has(artistId)) {
      return false;
    }
    if (this.currentArtistId === artistId && !options.rerunIfActive) {
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
      disabled: this.disabled,
      currentArtistId: this.currentArtistId,
      pendingCount: this.queue.length,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      totalEnqueued: this.totalEnqueued,
    };
  }

  async waitUntilIdle(): Promise<void> {
    while (this.drainPromise) {
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
    if (process.env.VERCEL) {
      waitUntil(this.drainPromise);
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      if (process.env.VERCEL) {
        const deadline = getDeadline();
        if (deadline && deadline.getTime() - Date.now() < VERCEL_DRAIN_SAFETY_MARGIN_MS) {
          this.queue.length = 0;
          this.queuedSet.clear();
          break;
        }
      }

      const nextId = this.queue.shift();
      if (!nextId) {
        break;
      }
      this.queuedSet.delete(nextId);

      if (this.lastRunStartedAt !== null) {
        await delay(this.minIntervalMs - (Date.now() - this.lastRunStartedAt));
      }

      this.currentArtistId = nextId;
      this.lastRunStartedAt = Date.now();

      try {
        await this.processor(nextId);
        this.processedCount += 1;
      } catch (error: unknown) {
        this.failedCount += 1;
        if (process.env.NODE_ENV !== "test") {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[KUE] Sync failed for artist ${nextId}: ${message}`);
        }
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
  globalForQueue.kueSyncQueue ??= new SyncQueue({
    disabled: process.env.KUE_SYNC_DISABLED === "1",
  });
  return globalForQueue.kueSyncQueue;
}

/** Re-queues every artist left PENDING/SYNCING (e.g. after a restart). Returns how many. */
export async function recoverPendingArtists(
  db: PrismaClient = getDb(),
  queue: SyncQueue = getSyncQueue(),
  options: { staleSyncingMinutes?: number } = {},
): Promise<number> {
  const syncingWhere =
    options.staleSyncingMinutes && options.staleSyncingMinutes > 0
      ? {
          syncStatus: "SYNCING" as const,
          updatedAt: { lt: new Date(Date.now() - options.staleSyncingMinutes * 60_000) },
        }
      : { syncStatus: "SYNCING" as const };

  await db.artist.updateMany({
    where: syncingWhere,
    data: { syncStatus: "PENDING" },
  });

  const pending = await db.artist.findMany({
    where: { syncStatus: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  return queue.enqueueMany(pending.map((artist) => artist.id));
}

/** Moves FAILED artists back to PENDING and re-queues every pending artist. */
export async function retryFailedArtists(
  db: PrismaClient = getDb(),
  queue: SyncQueue = getSyncQueue(),
): Promise<number> {
  await db.artist.updateMany({
    where: { syncStatus: "FAILED" },
    data: { syncStatus: "PENDING", syncError: null },
  });
  return recoverPendingArtists(db, queue);
}
