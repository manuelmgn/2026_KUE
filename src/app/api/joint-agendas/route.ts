import { type NextRequest, NextResponse } from "next/server";
import type { CreateJointAgendaInput } from "@/domain/schemas";
import { handleGroupPlanningApiError, parseJsonObjectBody } from "@/server/api-helpers";
import { getCurrentUser } from "@/server/auth/dal";
import { createJointAgenda, listJointAgendas } from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

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
    return handleGroupPlanningApiError(error, "Joint agendas GET error");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await parseJsonObjectBody(request)) as unknown as CreateJointAgendaInput;
    const created = await createJointAgenda(user.id, body);
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleGroupPlanningApiError(error, "Joint agendas POST error");
  }
}
