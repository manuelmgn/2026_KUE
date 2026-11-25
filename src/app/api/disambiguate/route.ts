import { NextResponse } from "next/server";
import { ExternalApiError, searchMusicBrainzArtists } from "@/server/clients/musicbrainz";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 200;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ error: "Parámetro q obligatorio" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Búsqueda demasiado larga" }, { status: 400 });
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
    return NextResponse.json({ error: "Error consultando MusicBrainz" }, { status: 502 });
  }
}
