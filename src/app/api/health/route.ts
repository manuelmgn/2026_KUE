import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: message,
      },
      { status: 503 },
    );
  }
}
