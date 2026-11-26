import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ForbiddenError, UnauthorizedError } from "@/domain/errors";
import { comparisonSortModeSchema } from "@/domain/schemas";
import { getCurrentUser } from "@/server/auth/dal";
import {
  deleteFestivalComparison,
  getSavedFestivalComparison,
  updateFestivalComparison,
} from "@/server/services/group-planning";

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
  console.error("[KUE] Comparison detail API error:", error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ comparisonId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { comparisonId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const rawSortBy = searchParams.get("sortBy");
    const sortBy = rawSortBy ? comparisonSortModeSchema.parse(rawSortBy) : undefined;
    const onlyRated = searchParams.get("onlyRated") === "true";

    const comparison = await getSavedFestivalComparison(user.id, comparisonId, {
      ...(sortBy !== undefined ? { sortBy } : {}),
      onlyRated,
    });

    return NextResponse.json(comparison, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ comparisonId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { comparisonId } = await params;
    const body = (await request.json()) as {
      name?: string;
      friendIds?: string[];
    };

    const updated = await updateFestivalComparison(user.id, {
      comparisonId,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.friendIds !== undefined ? { friendIds: body.friendIds } : {}),
    });

    return NextResponse.json(updated, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ comparisonId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { comparisonId } = await params;
    await deleteFestivalComparison(user.id, { comparisonId });
    return NextResponse.json(
      { deleted: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
