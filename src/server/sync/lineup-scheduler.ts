import {
  runOneTimeEmptyLineupRecheck,
  runScheduledLineupSyncs,
} from "@/server/services/lineup-sync";

const SCHEDULER_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const INITIAL_DELAY_MS = 60 * 1000; // 1 minute after startup
const ONE_TIME_RECHECK_DELAY_MS = 5 * 1000; // 5 seconds after startup

const globalForLineupScheduler = globalThis as typeof globalThis & {
  kueLineupSchedulerStarted?: boolean;
  kueLineupSchedulerRunning?: boolean;
  kueOneTimeRecheckScheduled?: boolean;
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

  if (
    process.env.KUE_RECHECK_EMPTY_LINEUPS_ONCE !== "0" &&
    !globalForLineupScheduler.kueOneTimeRecheckScheduled
  ) {
    globalForLineupScheduler.kueOneTimeRecheckScheduled = true;
    const recheckTimer = setTimeout(() => {
      void runOneTimeEmptyLineupRecheck().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[KUE] One-time empty lineup recheck error: ${message}`);
      });
    }, ONE_TIME_RECHECK_DELAY_MS);
    recheckTimer.unref();
  }

  const initialTimer = setTimeout(() => {
    void tick();
  }, INITIAL_DELAY_MS);
  initialTimer.unref();

  const intervalTimer = setInterval(() => {
    void tick();
  }, SCHEDULER_POLL_INTERVAL_MS);
  intervalTimer.unref();
}
