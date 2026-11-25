import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getSyncQueue, retryFailedArtists } from "@/server/sync/queue";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const queue = getSyncQueue();

  const grouped = await db.artist.groupBy({
    by: ["syncStatus"],
    _count: { _all: true },
  });
  const countOf = (status: string) =>
    grouped.find((group) => group.syncStatus === status)?._count._all ?? 0;

  const pending = countOf("PENDING");
  const syncing = countOf("SYNCING");
  const synced = countOf("SYNCED");
  const failed = countOf("FAILED");

  return NextResponse.json(
    {
      queue: queue.getStatus(),
      counts: {
        pending,
        syncing,
        synced,
        failed,
        total: pending + syncing + synced + failed,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(): Promise<NextResponse> {
  const queue = getSyncQueue();
  const enqueued = await retryFailedArtists(getDb(), queue);

  return NextResponse.json({
    enqueued,
    queue: queue.getStatus(),
  });
}
