import { openMeteoGeocodingResponseSchema, type PlaceCandidate } from "@/domain/schemas";
import { ExternalApiError } from "@/server/clients/musicbrainz";

const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(
  query: string,
  limit = 6,
  timeoutMs = 8_000,
  language: "pt" | "es" = "pt",
): Promise<PlaceCandidate[]> {
  const cleaned = query.trim();
  if (cleaned.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: cleaned,
    count: String(Math.min(Math.max(limit, 1), 10)),
    language,
    format: "json",
  });

  const response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ExternalApiError(
      "open-meteo-geocoding",
      response.status,
      `Open-Meteo geocoding failed with HTTP ${response.status}`,
    );
  }

  let json: unknown;
  try {
    json = (await response.json()) as unknown;
  } catch {
    throw new ExternalApiError(
      "open-meteo-geocoding",
      502,
      "Malformed Open-Meteo geocoding response",
    );
  }

  const parsed = openMeteoGeocodingResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExternalApiError(
      "open-meteo-geocoding",
      502,
      "Malformed Open-Meteo geocoding payload",
    );
  }

  return parsed.data.results.slice(0, limit).map((item) => ({
    placeId: String(item.id),
    name: item.name,
    province: item.admin2?.trim() || null,
    region: item.admin1?.trim() || null,
    country: item.country?.trim() || null,
    countryCode: item.country_code?.trim().toUpperCase() || null,
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}
