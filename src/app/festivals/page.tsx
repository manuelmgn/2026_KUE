import { FestivalsView } from "@/components/features/FestivalsView";
import type { CatalogFestivalDTO, FestivalArchiveItemDTO } from "@/components/features/types";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listAllCatalogFestivals, listUserEditionsWithCounts } from "@/server/services/festivals";

export const dynamic = "force-dynamic";

export default async function FestivalsPage() {
  const user = await requirePageUser("/festivals");
  const [{ locale }, rawMyEditions, rawCatalog] = await Promise.all([
    getServerDictionary(),
    listUserEditionsWithCounts(user.id),
    listAllCatalogFestivals(user.id),
  ]);

  const placesLang = getPlacesApiLanguage(locale);

  const archiveItems: FestivalArchiveItemDTO[] = await Promise.all(
    rawMyEditions.map(async (ed) => ({
      id: ed.id,
      festivalId: ed.festival.id,
      brandSlug: ed.festival.slug,
      slug: ed.slug,
      name: ed.festival.name,
      year: ed.year,
      location: await getLocalizedPlaceName(ed.locationPlaceId, placesLang, ed.location),
      startDate: ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null,
      endDate: ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null,
      entriesCount: ed._count.entries,
    })),
  );

  const catalogItems: CatalogFestivalDTO[] = await Promise.all(
    rawCatalog.map(async (fest) => ({
      id: fest.id,
      slug: fest.slug,
      name: fest.name,
      location: await getLocalizedPlaceName(fest.locationPlaceId, placesLang, fest.location),
      locationProvince: fest.locationProvince,
      locationRegion: fest.locationRegion,
      locationCountry: fest.locationCountry,
      locationCountryCode: fest.locationCountryCode,
      locationLatitude: fest.locationLatitude,
      locationLongitude: fest.locationLongitude,
      locationPlaceId: fest.locationPlaceId,
      editions: await Promise.all(
        fest.editions.map(async (ed) => ({
          id: ed.id,
          festivalId: fest.id,
          slug: ed.slug,
          year: ed.year,
          location: await getLocalizedPlaceName(ed.locationPlaceId, placesLang, ed.location),
          startDate: ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null,
          endDate: ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null,
          entriesCount: ed._count.entries,
          followersCount: ed._count.followers,
          isAdded: ed.isAdded,
        })),
      ),
    })),
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <FestivalsView
      initialFestivals={archiveItems}
      initialCatalog={catalogItems}
      activeFestivalSlug={null}
      todayIso={todayIso}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
