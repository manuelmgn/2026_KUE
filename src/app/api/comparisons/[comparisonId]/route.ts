import { type NextRequest, NextResponse } from "next/server";
import { comparisonSortModeSchema } from "@/domain/schemas";
import { handleGroupPlanningApiError, parseJsonObjectBody } from "@/server/api-helpers";
import { getCurrentUser } from "@/server/auth/dal";
import {
  deleteFestivalComparison,
  getSavedFestivalComparison,
  updateFestivalComparison,
} from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

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
    return handleGroupPlanningApiError(error, "Comparison detail GET error");
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
    const body = (await parseJsonObjectBody(request)) as {
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
    return handleGroupPlanningApiError(error, "Comparison detail PATCH error");
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
    return handleGroupPlanningApiError(error, "Comparison detail DELETE error");
  }
}
