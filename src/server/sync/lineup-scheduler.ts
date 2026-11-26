import { runScheduledLineupSyncs } from "@/server/services/lineup-sync";

const SCHEDULER_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const INITIAL_DELAY_MS = 60 * 1000; // 1 minute after startup

const globalForLineupScheduler = globalThis as typeof globalThis & {
  kueLineupSchedulerStarted?: boolean;
  kueLineupSchedulerRunning?: boolean;
};

async function tick(): Promise<void> {
  if (globalForLineupScheduler.kueLineupSchedulerRunning) {
    return;
  }
  globalForLineupScheduler.kueLineupSchedulerRunning = true;
  try {
    await runScheduledLineupSyncs();
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== "test") {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[KUE] Lineup scheduler tick error: ${message}`);
    }
  } finally {
    globalForLineupScheduler.kueLineupSchedulerRunning = false;
  }
}

export function startLineupSyncScheduler(): void {
  if (
    process.env.KUE_SYNC_DISABLED === "1" ||
    process.env.NODE_ENV === "test" ||
    globalForLineupScheduler.kueLineupSchedulerStarted
  ) {
    return;
  }

  globalForLineupScheduler.kueLineupSchedulerStarted = true;

  const initialTimer = setTimeout(() => {
    void tick();
  }, INITIAL_DELAY_MS);
  initialTimer.unref();

  const intervalTimer = setInterval(() => {
    void tick();
  }, SCHEDULER_POLL_INTERVAL_MS);
  intervalTimer.unref();
}
