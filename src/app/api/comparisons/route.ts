import { type NextRequest, NextResponse } from "next/server";
import type { CreateFestivalComparisonInput } from "@/domain/schemas";
import { handleGroupPlanningApiError, parseJsonObjectBody } from "@/server/api-helpers";
import { getCurrentUser } from "@/server/auth/dal";
import {
  createFestivalComparison,
  listCoincidingFestivals,
  listSavedFestivalComparisons,
} from "@/server/services/group-planning";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const editionId = searchParams.get("editionId")?.trim() || undefined;
    const includeCoincidences = searchParams.get("includeCoincidences") === "true";

    const [comparisons, coincidences] = await Promise.all([
      listSavedFestivalComparisons(user.id, {
        ...(editionId !== undefined ? { editionId } : {}),
      }),
      includeCoincidences ? listCoincidingFestivals(user.id) : Promise.resolve(undefined),
    ]);

    return NextResponse.json(
      includeCoincidences ? { comparisons, coincidences } : { comparisons },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    return handleGroupPlanningApiError(error, "Comparisons GET error");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await parseJsonObjectBody(request)) as unknown as CreateFestivalComparisonInput;
    const created = await createFestivalComparison(user.id, body);
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return handleGroupPlanningApiError(error, "Comparisons POST error");
  }
}
