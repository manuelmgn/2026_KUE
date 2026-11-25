import { Suspense } from "react";
import { RawImporter } from "@/components/features/RawImporter";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalSummary } from "@/components/features/types";
import { getDefaultFestival, getFestivalBySlug, listFestivals } from "@/server/services/festivals";

export const dynamic = "force-dynamic";

interface ImportPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const festivals = await listFestivals();
  const summaries: FestivalSummary[] = festivals.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    year: f.year,
    location: f.location,
  }));

  const active = params.festival
    ? ((await getFestivalBySlug(params.festival)) ?? (await getDefaultFestival()))
    : await getDefaultFestival();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={active?.slug ?? null} />
      </Suspense>
      <RawImporter festivals={summaries} initialFestivalId={active?.id ?? null} />
    </div>
  );
}
