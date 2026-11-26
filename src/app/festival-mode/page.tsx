import Link from "next/link";
import { Suspense } from "react";
import { FestivalModeView } from "@/components/features/FestivalModeView";
import { TopBar } from "@/components/features/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getServerDictionary } from "@/i18n/server";
import { listFestivalEntries } from "@/server/services/entries";
import { listFestivals } from "@/server/services/festivals";
import {
  resolveActiveFestival,
  toFestivalSummary,
  toLineupEntryDTO,
  toLocalizedFestivalSummary,
} from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalModePageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function FestivalModePage({ searchParams }: FestivalModePageProps) {
  const [params, { locale, dict }] = await Promise.all([searchParams, getServerDictionary()]);
  const festivals = await listFestivals();
  const summaries = festivals.map(toFestivalSummary);
  const activeFestivalRaw = resolveActiveFestival(festivals, params.festival);
  const activeFestival = activeFestivalRaw
    ? await toLocalizedFestivalSummary(activeFestivalRaw, locale)
    : null;

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
          title={dict.festivalMode.noFestivalTitle}
          description={dict.festivalMode.noFestivalDescription}
          action={
            <Link
              href="/import"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-xs font-semibold uppercase text-acid-ink"
            >
              {dict.festivalMode.noFestivalAction}
            </Link>
          }
        />
      )}
    </div>
  );
}
