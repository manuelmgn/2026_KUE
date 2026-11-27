import { NextResponse } from "next/server";
import { getServerDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/server/auth/dal";
import { ExternalApiError, searchMusicBrainzArtists } from "@/server/clients/musicbrainz";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 200;

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { dict } = await getServerDictionary();
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ error: dict.errors.missingQueryParam }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: dict.errors.queryTooLong }, { status: 400 });
  }

  try {
    const candidates = await searchMusicBrainzArtists(query, 5);
    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    if (error instanceof ExternalApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: dict.errors.musicBrainzServiceError }, { status: 502 });
  }
}
