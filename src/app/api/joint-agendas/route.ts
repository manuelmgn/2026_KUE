import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ForbiddenError, UnauthorizedError } from "@/domain/errors";
import type { CreateJointAgendaInput } from "@/domain/schemas";
import { getCurrentUser } from "@/server/auth/dal";
import { createJointAgenda, listJointAgendas } from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos no válidos" },
      { status: 400 },
    );
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[KUE] Joint agendas API error:", error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const editionId = request.nextUrl.searchParams.get("editionId")?.trim() || undefined;
    const agendas = await listJointAgendas(user.id, {
      ...(editionId !== undefined ? { editionId } : {}),
    });

    return NextResponse.json(
      { agendas },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateJointAgendaInput;
    const created = await createJointAgenda(user.id, body);
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
