import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getSyncQueue } from "@/server/sync/queue";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const queue = getSyncQueue();

  const [pending, syncing, synced, failed] = await Promise.all([
    db.artist.count({ where: { syncStatus: "PENDING" } }),
    db.artist.count({ where: { syncStatus: "SYNCING" } }),
    db.artist.count({ where: { syncStatus: "SYNCED" } }),
    db.artist.count({ where: { syncStatus: "FAILED" } }),
  ]);

  return NextResponse.json({
    queue: queue.getStatus(),
    counts: {
      pending,
      syncing,
      synced,
      failed,
      total: pending + syncing + synced + failed,
    },
  });
}

export async function POST(): Promise<NextResponse> {
  const db = getDb();
  const queue = getSyncQueue();

  await db.artist.updateMany({
    where: { syncStatus: "FAILED" },
    data: { syncStatus: "PENDING", syncError: null },
  });

  const toSync = await db.artist.findMany({
    where: { syncStatus: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const enqueued = queue.enqueueMany(toSync.map((a) => a.id));

  return NextResponse.json({
    enqueued,
    queue: queue.getStatus(),
  });
}
