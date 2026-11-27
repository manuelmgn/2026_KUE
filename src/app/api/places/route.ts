import { NextResponse } from "next/server";
import { getPlacesApiLanguage, normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getServerLocale } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth/dal";
import { ExternalApiError } from "@/server/clients/musicbrainz";
import { searchPlaces } from "@/server/clients/places";

export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const langParam = url.searchParams.get("lang");
  const locale = langParam ? normalizeLocale(langParam) : await getServerLocale();
  const dict = getDictionary(locale);

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ places: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: dict.errors.queryTooLong }, { status: 400 });
  }

  try {
    const places = await searchPlaces(query, 6, 8_000, getPlacesApiLanguage(locale));
    return NextResponse.json({ places }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error: unknown) {
    if (error instanceof ExternalApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: dict.errors.placesServiceError }, { status: 502 });
  }
}
