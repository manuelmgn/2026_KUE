import { Suspense } from "react";
import { RawImporter } from "@/components/features/RawImporter";
import { TopBar } from "@/components/features/TopBar";
import { listFestivals } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface ImportPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const summaries = (await listFestivals()).map(toFestivalSummary);
  const active = resolveActiveFestival(summaries, params.festival);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={active?.slug ?? null} />
      </Suspense>
      <RawImporter festivals={summaries} initialFestivalId={active?.id ?? null} />
    </div>
  );
}
