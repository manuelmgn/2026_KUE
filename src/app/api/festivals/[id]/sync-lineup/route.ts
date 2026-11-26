import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";
import { getCurrentUser } from "@/server/auth/dal";
import { checkFestivalLineupSync } from "@/server/services/lineup-sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Festival ID obligatorio" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body.force === true;
  } catch {
    // Empty body is fine
  }

  try {
    const result = await checkFestivalLineupSync(id, { force });
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const message =
      process.env.NODE_ENV === "production"
        ? "Error al comprobar el cartel"
        : error instanceof Error
          ? error.message
          : "Error al comprobar el cartel";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
