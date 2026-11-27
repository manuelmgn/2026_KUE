import { notFound, redirect } from "next/navigation";
import { FestivalManageView } from "@/components/features/FestivalManageView";
import type { FestivalEditDTO } from "@/components/features/types";
import { festivalHomePath } from "@/domain/festival-routes";
import { getPlacesApiLanguage } from "@/i18n/config";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getLocalizedPlaceName } from "@/server/clients/places";
import { listFestivalEntries } from "@/server/services/entries";
import { getEditionByBrandAndYear, getEditionWithSiblingYears } from "@/server/services/festivals";
import { parsePendingLineupDiff } from "@/server/services/lineup-sync";
import { toLineupEntryDTO } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalEditPageProps {
  params: Promise<{ brandSlug: string; year: string }>;
}

export default async function FestivalEditPage({ params }: FestivalEditPageProps) {
  const { brandSlug, year: yearParam } = await params;
  const year = Number(yearParam);
  const user = await requirePageUser(
    `/festivals/${encodeURIComponent(brandSlug)}/${yearParam}/editar`,
  );
  if (user.role !== "ADMIN") {
    redirect(festivalHomePath({ brandSlug, year }));
  }

  const [{ locale }, edition] = await Promise.all([
    getServerDictionary(),
    getEditionByBrandAndYear(brandSlug, year),
  ]);

  if (!edition) {
    notFound();
  }

  const isAdmin = user.role === "ADMIN";
  const [localizedLocation, rawEntries, existingYears] = await Promise.all([
    getLocalizedPlaceName(edition.locationPlaceId, getPlacesApiLanguage(locale), edition.location),
    listFestivalEntries(user.id, edition.id),
    getEditionWithSiblingYears(edition.id),
  ]);

  const parsedPendingDiff = parsePendingLineupDiff(edition.pendingLineupDiff);

  const activeEdit: FestivalEditDTO = {
    id: edition.id,
    festivalId: edition.festival.id,
    brandSlug: edition.festival.slug,
    slug: edition.slug,
    name: edition.festival.name,
    year: edition.year,
    location: localizedLocation,
    locationProvince: edition.locationProvince,
    locationRegion: edition.locationRegion,
    locationCountry: edition.locationCountry,
    locationCountryCode: edition.locationCountryCode,
    locationLatitude: edition.locationLatitude,
    locationLongitude: edition.locationLongitude,
    locationPlaceId: edition.locationPlaceId,
    startDate: edition.startDate ? edition.startDate.toISOString().slice(0, 10) : null,
    endDate: edition.endDate ? edition.endDate.toISOString().slice(0, 10) : null,
    lineupSourceUrl: edition.lineupSourceUrl,
    autoSyncEnabled: edition.autoSyncEnabled,
    autoSyncMode: edition.autoSyncMode,
    syncIntervalHours: edition.syncIntervalHours,
    lastLineupSyncAt:
      isAdmin && edition.lastLineupSyncAt ? edition.lastLineupSyncAt.toISOString() : null,
    lastLineupSyncError: isAdmin ? edition.lastLineupSyncError : null,
    pendingLineupDiff: isAdmin && parsedPendingDiff ? parsedPendingDiff : null,
    existingYears,
  };

  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <FestivalManageView
      key={activeEdit.id}
      festival={activeEdit}
      initialEntries={rawEntries.map(toLineupEntryDTO)}
      hasGeminiApiKey={hasGeminiApiKey}
      isAdmin={isAdmin}
    />
  );
}
