import Link from "next/link";
import { Suspense } from "react";
import { FestivalManageView } from "@/components/features/FestivalManageView";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalEditDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listFestivalEntries } from "@/server/services/entries";
import {
  getEditionBySlug,
  getEditionWithSiblingYears,
  listUserEditions,
} from "@/server/services/festivals";
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
  const user = await requirePageUser("/manage");
  const [params, { locale, dict }, myEditions] = await Promise.all([
    searchParams,
    getServerDictionary(),
    listUserEditions(user.id),
  ]);

  const summaries = myEditions.map(toFestivalSummary);
  const requestedEdition = params.festival
    ? (myEditions.find((ed) => ed.slug === params.festival) ??
      (await getEditionBySlug(params.festival)))
    : null;
  const activeRaw = requestedEdition ?? resolveActiveFestival(myEditions, params.festival);

  const isAdmin = user.role === "ADMIN";
  let activeEdit: FestivalEditDTO | null = null;
  let entries: ReturnType<typeof toLineupEntryDTO>[] = [];

  if (activeRaw) {
    const [localizedLocation, rawEntries, existingYears] = await Promise.all([
      getLocalizedPlaceName(
        activeRaw.locationPlaceId,
        getPlacesApiLanguage(locale),
        activeRaw.location,
      ),
      listFestivalEntries(user.id, activeRaw.id),
      getEditionWithSiblingYears(activeRaw.id),
    ]);

    const parsedPendingDiff = parsePendingLineupDiff(activeRaw.pendingLineupDiff);

    activeEdit = {
      id: activeRaw.id,
      festivalId: activeRaw.festival.id,
      slug: activeRaw.slug,
      name: activeRaw.festival.name,
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
      lastLineupSyncAt:
        isAdmin && activeRaw.lastLineupSyncAt ? activeRaw.lastLineupSyncAt.toISOString() : null,
      lastLineupSyncError: isAdmin ? activeRaw.lastLineupSyncError : null,
      pendingLineupDiff: parsedPendingDiff
        ? isAdmin
          ? parsedPendingDiff
          : { ...parsedPendingDiff, checkedAt: "" }
        : null,
      existingYears,
    };
    entries = rawEntries.map(toLineupEntryDTO);
  }

  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={summaries}
          activeFestivalSlug={activeEdit?.slug ?? null}
          currentUser={user}
        />
      </Suspense>

      {activeEdit ? (
        <FestivalManageView
          key={activeEdit.id}
          festival={activeEdit}
          initialEntries={entries}
          hasGeminiApiKey={hasGeminiApiKey}
          isAdmin={isAdmin}
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
