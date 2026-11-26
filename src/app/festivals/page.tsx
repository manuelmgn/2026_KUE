import { Suspense } from "react";
import { FestivalsView } from "@/components/features/FestivalsView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalArchiveItemDTO } from "@/components/features/types";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listFestivalsWithCounts } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalsPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function FestivalsPage({ searchParams }: FestivalsPageProps) {
  const [params, { locale }] = await Promise.all([searchParams, getServerDictionary()]);
  const rawFestivals = await listFestivalsWithCounts();
  const summaries = rawFestivals.map(toFestivalSummary);
  const active = resolveActiveFestival(summaries, params.festival);

  const placesLang = getPlacesApiLanguage(locale);
  const archiveItems: FestivalArchiveItemDTO[] = await Promise.all(
    rawFestivals.map(async (fest) => ({
      id: fest.id,
      slug: fest.slug,
      name: fest.name,
      year: fest.year,
      location: await getLocalizedPlaceName(fest.locationPlaceId, placesLang, fest.location),
      startDate: fest.startDate ? fest.startDate.toISOString().slice(0, 10) : null,
      endDate: fest.endDate ? fest.endDate.toISOString().slice(0, 10) : null,
      entriesCount: fest._count.entries,
    })),
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={active?.slug ?? null} />
      </Suspense>
      <FestivalsView
        initialFestivals={archiveItems}
        activeFestivalSlug={active?.slug ?? null}
        todayIso={todayIso}
      />
    </div>
  );
}
