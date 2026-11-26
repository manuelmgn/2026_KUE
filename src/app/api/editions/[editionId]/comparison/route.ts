import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, ForbiddenError, UnauthorizedError } from "@/domain/errors";
import { comparisonSortModeSchema } from "@/domain/schemas";
import { getCurrentUser } from "@/server/auth/dal";
import { createFestivalComparison, getFestivalComparison } from "@/server/services/group-planning";

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
  console.error("[KUE] Group comparison API error:", error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ editionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { editionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const rawFriends = searchParams.get("friends");
    const friendIds = rawFriends
      ? rawFriends
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;

    const rawSortBy = searchParams.get("sortBy");
    const sortBy = rawSortBy ? comparisonSortModeSchema.parse(rawSortBy) : undefined;
    const onlyRated = searchParams.get("onlyRated") === "true";

    const table = await getFestivalComparison(user.id, {
      editionId,
      ...(friendIds !== undefined ? { friendIds } : {}),
      ...(sortBy !== undefined ? { sortBy } : {}),
      onlyRated,
    });

    return NextResponse.json(table, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ editionId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { editionId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      friendIds?: string[];
      name?: string;
    };

    const saved = await createFestivalComparison(user.id, {
      editionId,
      ...(body.friendIds !== undefined ? { friendIds: body.friendIds } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    });

    return NextResponse.json(saved, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
