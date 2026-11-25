import Link from "next/link";
import { Suspense } from "react";
import { FestivalModeView } from "@/components/features/FestivalModeView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { listFestivalEntries } from "@/server/services/entries";
import { getDefaultFestival, getFestivalBySlug, listFestivals } from "@/server/services/festivals";

export const dynamic = "force-dynamic";

interface FestivalModePageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function FestivalModePage({ searchParams }: FestivalModePageProps) {
  const params = await searchParams;
  const festivals = await listFestivals();
  const summaries: FestivalSummary[] = festivals.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    year: f.year,
    location: f.location,
  }));

  const activeFestival = params.festival
    ? ((await getFestivalBySlug(params.festival)) ?? (await getDefaultFestival()))
    : await getDefaultFestival();

  const rawEntries = activeFestival ? await listFestivalEntries(activeFestival.id) : [];
  const entries: LineupEntryDTO[] = rawEntries.map((entry) => ({
    id: entry.id,
    festivalId: entry.festivalId,
    billingName: entry.billingName,
    subtitle: entry.subtitle,
    day: entry.day,
    stage: entry.stage,
    setTime: entry.setTime,
    liveRating: entry.liveRating,
    liveNotes: entry.liveNotes,
    artists: entry.artists.map((link) => ({
      id: link.artist.id,
      name: link.artist.name,
      country: link.artist.country,
      imagePath: link.artist.imagePath,
      rating: link.artist.rating,
      status: link.artist.status,
      notes: link.artist.notes,
      syncStatus: link.artist.syncStatus,
    })),
  }));

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={activeFestival?.slug ?? null} />
      </Suspense>

      {activeFestival ? (
        <FestivalModeView
          festival={{
            id: activeFestival.id,
            slug: activeFestival.slug,
            name: activeFestival.name,
            year: activeFestival.year,
            location: activeFestival.location,
          }}
          entries={entries}
        />
      ) : (
        <EmptyState
          title="Sin festival activo"
          description="Importa primero un cartel para usar Modo Festival."
          action={
            <Link
              href="/import"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-xs font-semibold uppercase text-acid-ink"
            >
              Ir al importador →
            </Link>
          }
        />
      )}
    </div>
  );
}
