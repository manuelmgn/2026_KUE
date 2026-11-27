import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

const HEALTH_CACHE_TTL_MS = 5_000;
let lastHealthyAt = 0;
let lastHealthyTimestamp = "";

export async function GET(): Promise<NextResponse> {
  const now = Date.now();
  if (lastHealthyAt > 0 && now - lastHealthyAt < HEALTH_CACHE_TTL_MS) {
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        timestamp: lastHealthyTimestamp,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    const timestamp = new Date(now).toISOString();
    lastHealthyAt = now;
    lastHealthyTimestamp = timestamp;
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        timestamp,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    lastHealthyAt = 0;
    const message =
      process.env.NODE_ENV === "production"
        ? "Database unavailable"
        : error instanceof Error
          ? error.message
          : "Unknown database error";
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
