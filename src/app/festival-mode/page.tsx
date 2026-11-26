import Link from "next/link";
import { Suspense } from "react";
import { FestivalModeView } from "@/components/features/FestivalModeView";
import { TopBar } from "@/components/features/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { listFestivalEntries } from "@/server/services/entries";
import { getEditionBySlug, listUserEditions } from "@/server/services/festivals";
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
  const user = await requirePageUser("/festival-mode");
  const [params, { locale, dict }, editions] = await Promise.all([
    searchParams,
    getServerDictionary(),
    listUserEditions(user.id),
  ]);

  const summaries = editions.map(toFestivalSummary);
  let activeFestivalRaw = resolveActiveFestival(editions, params.festival);
  if (!activeFestivalRaw && params.festival) {
    activeFestivalRaw = await getEditionBySlug(params.festival);
  }
  const activeFestival = activeFestivalRaw
    ? await toLocalizedFestivalSummary(activeFestivalRaw, locale)
    : null;

  const entries = activeFestival
    ? (await listFestivalEntries(user.id, activeFestival.id)).map(toLineupEntryDTO)
    : [];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={summaries}
          activeFestivalSlug={activeFestival?.slug ?? null}
          currentUser={user}
        />
      </Suspense>

      {activeFestival ? (
        <FestivalModeView festival={activeFestival} entries={entries} />
      ) : (
        <EmptyState
          title={dict.festivalMode.noFestivalTitle}
          description={dict.festivalMode.noFestivalDescription}
          action={
            <Link
              href="/festivals"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-xs font-semibold uppercase text-acid-ink"
            >
              {dict.home.emptyAction}
            </Link>
          }
        />
      )}
    </div>
  );
}
