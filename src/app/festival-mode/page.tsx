import Link from "next/link";
import { Suspense } from "react";
import { FestivalModeView } from "@/components/features/FestivalModeView";
import { TopBar } from "@/components/features/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { listFestivalEntries } from "@/server/services/entries";
import { listFestivals } from "@/server/services/festivals";
import {
  resolveActiveFestival,
  toFestivalSummary,
  toLineupEntryDTO,
} from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalModePageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function FestivalModePage({ searchParams }: FestivalModePageProps) {
  const params = await searchParams;
  const summaries = (await listFestivals()).map(toFestivalSummary);
  const activeFestival = resolveActiveFestival(summaries, params.festival);

  const entries = activeFestival
    ? (await listFestivalEntries(activeFestival.id)).map(toLineupEntryDTO)
    : [];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={activeFestival?.slug ?? null} />
      </Suspense>

      {activeFestival ? (
        <FestivalModeView festival={activeFestival} entries={entries} />
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
