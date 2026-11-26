import { NextResponse } from "next/server";
import { ExternalApiError } from "@/server/clients/musicbrainz";
import { searchPlaces } from "@/server/clients/places";

export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ places: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Búsqueda demasiado larga" }, { status: 400 });
  }

  try {
    const places = await searchPlaces(query, 6);
    return NextResponse.json({ places }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error: unknown) {
    if (error instanceof ExternalApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { error: "Error consultando el servicio de lugares" },
      { status: 502 },
    );
  }
}
