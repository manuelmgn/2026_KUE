import { handleSchedule } from "@vercel/schedules";
import { getDb } from "@/server/db";
import { runScheduledLineupSyncs } from "@/server/services/lineup-sync";
import { ensureBootstrapAdmin } from "@/server/services/users";
import { getSyncQueue, recoverPendingArtists } from "@/server/sync/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleSchedule(async (metadata) => {
  await ensureBootstrapAdmin().catch(() => undefined);

  const lineupResult = await runScheduledLineupSyncs();
  const queue = getSyncQueue();
  const recovered = await recoverPendingArtists(getDb(), queue, { staleSyncingMinutes: 5 });

  await queue.waitUntilIdle();

  console.info(
    JSON.stringify({
      event: "vercel_schedule_lineup_sync",
      executionId: metadata.executionId,
      scheduledAt: metadata.scheduledAt.toISOString(),
      checkedEditions: lineupResult.checked,
      failedEditions: lineupResult.failed,
      recoveredArtists: recovered,
    }),
  );
});
