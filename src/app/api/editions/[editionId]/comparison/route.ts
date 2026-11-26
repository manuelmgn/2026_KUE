import { type NextRequest, NextResponse } from "next/server";
import { comparisonSortModeSchema } from "@/domain/schemas";
import { handleGroupPlanningApiError, parseJsonObjectBody } from "@/server/api-helpers";
import { getCurrentUser } from "@/server/auth/dal";
import { createFestivalComparison, getFestivalComparison } from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

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
    return handleGroupPlanningApiError(error, "Edition comparison GET error");
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
    const body = (await parseJsonObjectBody(request, { allowEmpty: true })) as {
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
    return handleGroupPlanningApiError(error, "Edition comparison POST error");
  }
}
