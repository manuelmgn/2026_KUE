import { notFound } from "next/navigation";
import { FestivalModeView } from "@/components/features/FestivalModeView";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { listFestivalEntries } from "@/server/services/entries";
import { getEditionByBrandAndYear } from "@/server/services/festivals";
import { toLineupEntryDTO, toLocalizedFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalAgendaPageProps {
  params: Promise<{ brandSlug: string; year: string }>;
}

export default async function FestivalAgendaPage({ params }: FestivalAgendaPageProps) {
  const { brandSlug, year: yearParam } = await params;
  const year = Number(yearParam);
  const user = await requirePageUser(
    `/festivals/${encodeURIComponent(brandSlug)}/${yearParam}/agenda`,
  );

  const [{ locale }, edition] = await Promise.all([
    getServerDictionary(),
    getEditionByBrandAndYear(brandSlug, year),
  ]);

  if (!edition) {
    notFound();
  }

  const [festival, rawEntries] = await Promise.all([
    toLocalizedFestivalSummary(edition, locale),
    listFestivalEntries(user.id, edition.id),
  ]);

  return (
    <FestivalModeView
      userId={user.id}
      festival={festival}
      entries={rawEntries.map(toLineupEntryDTO)}
    />
  );
}
