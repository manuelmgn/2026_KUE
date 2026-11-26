import Link from "next/link";
import { Suspense } from "react";
import { FestivalManageView } from "@/components/features/FestivalManageView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalEditDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listFestivalEntries } from "@/server/services/entries";
import { listFestivals } from "@/server/services/festivals";
import { parsePendingLineupDiff } from "@/server/services/lineup-sync";
import {
  resolveActiveFestival,
  toFestivalSummary,
  toLineupEntryDTO,
} from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface ManagePageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function ManagePage({ searchParams }: ManagePageProps) {
  const [params, { locale, dict }] = await Promise.all([searchParams, getServerDictionary()]);
  const festivals = await listFestivals();
  const summaries = festivals.map(toFestivalSummary);
  const activeRaw = resolveActiveFestival(festivals, params.festival);

  let activeEdit: FestivalEditDTO | null = null;
  let entries: ReturnType<typeof toLineupEntryDTO>[] = [];

  if (activeRaw) {
    const [localizedLocation, rawEntries] = await Promise.all([
      getLocalizedPlaceName(
        activeRaw.locationPlaceId,
        getPlacesApiLanguage(locale),
        activeRaw.location,
      ),
      listFestivalEntries(activeRaw.id),
    ]);

    activeEdit = {
      id: activeRaw.id,
      slug: activeRaw.slug,
      name: activeRaw.name,
      year: activeRaw.year,
      location: localizedLocation,
      locationProvince: activeRaw.locationProvince,
      locationRegion: activeRaw.locationRegion,
      locationCountry: activeRaw.locationCountry,
      locationCountryCode: activeRaw.locationCountryCode,
      locationLatitude: activeRaw.locationLatitude,
      locationLongitude: activeRaw.locationLongitude,
      locationPlaceId: activeRaw.locationPlaceId,
      startDate: activeRaw.startDate ? activeRaw.startDate.toISOString().slice(0, 10) : null,
      endDate: activeRaw.endDate ? activeRaw.endDate.toISOString().slice(0, 10) : null,
      lineupSourceUrl: activeRaw.lineupSourceUrl,
      autoSyncEnabled: activeRaw.autoSyncEnabled,
      autoSyncMode: activeRaw.autoSyncMode,
      syncIntervalHours: activeRaw.syncIntervalHours,
      lastLineupSyncAt: activeRaw.lastLineupSyncAt
        ? activeRaw.lastLineupSyncAt.toISOString()
        : null,
      lastLineupSyncError: activeRaw.lastLineupSyncError,
      pendingLineupDiff: parsePendingLineupDiff(activeRaw.pendingLineupDiff),
    };
    entries = rawEntries.map(toLineupEntryDTO);
  }

  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={summaries} activeFestivalSlug={activeEdit?.slug ?? null} />
      </Suspense>

      {activeEdit ? (
        <FestivalManageView
          key={activeEdit.id}
          festival={activeEdit}
          initialEntries={entries}
          hasGeminiApiKey={hasGeminiApiKey}
        />
      ) : (
        <EmptyState
          title={dict.manage.noFestivalTitle}
          description={dict.manage.noFestivalDescription}
          action={
            <Link
              href="/festivals"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              {dict.manage.goToFestivals}
            </Link>
          }
        />
      )}
    </div>
  );
}
