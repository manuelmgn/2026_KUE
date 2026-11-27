import { notFound } from "next/navigation";
import { FestivalGroupPlanningView } from "@/components/features/FestivalGroupPlanningView";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { getEditionByBrandAndYear, isEditionInUserFestivals } from "@/server/services/festivals";
import {
  getFestivalComparison,
  getJointAgenda,
  listCoincidingFestivals,
  listJointAgendas,
  listSavedFestivalComparisons,
} from "@/server/services/group-planning";
import { toLocalizedFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalComparisonPageProps {
  params: Promise<{ brandSlug: string; year: string }>;
  searchParams: Promise<{ tab?: string; agenda?: string }>;
}

export default async function FestivalComparisonPage({
  params,
  searchParams,
}: FestivalComparisonPageProps) {
  const { brandSlug, year: yearParam } = await params;
  const year = Number(yearParam);
  const user = await requirePageUser(
    `/festivals/${encodeURIComponent(brandSlug)}/${yearParam}/comparativa`,
  );

  const [query, { locale }, edition] = await Promise.all([
    searchParams,
    getServerDictionary(),
    getEditionByBrandAndYear(brandSlug, year),
  ]);

  if (!edition) {
    notFound();
  }

  const [festival, inMyFestivals, coincidingList, savedComparisons, agendas] = await Promise.all([
    toLocalizedFestivalSummary(edition, locale),
    isEditionInUserFestivals(user.id, edition.id),
    listCoincidingFestivals(user.id).catch(() => []),
    listSavedFestivalComparisons(user.id, { editionId: edition.id }).catch(() => []),
    listJointAgendas(user.id, { editionId: edition.id }).catch(() => []),
  ]);

  const coincidingForEdition = coincidingList.find((item) => item.edition.id === edition.id);
  const coincidingFriends = coincidingForEdition?.coincidingFriends ?? [];

  const targetAgendaId =
    (query.agenda && agendas.some((a) => a.id === query.agenda) ? query.agenda : null) ??
    agendas[0]?.id ??
    null;

  const [initialComparison, initialAgendaDetail] = await Promise.all([
    inMyFestivals && coincidingFriends.length > 0
      ? getFestivalComparison(user.id, { editionId: edition.id, sortBy: "AVG_DESC" }).catch(
          () => null,
        )
      : Promise.resolve(null),
    targetAgendaId
      ? getJointAgenda(user.id, targetAgendaId).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <FestivalGroupPlanningView
      currentUserId={user.id}
      festival={festival}
      isInMyFestivals={inMyFestivals}
      coincidingFriends={coincidingFriends}
      initialComparison={initialComparison}
      initialSavedComparisons={savedComparisons}
      initialAgendas={agendas}
      initialAgendaDetail={initialAgendaDetail}
      initialTab={query.tab === "agenda" ? "agenda" : "comparison"}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
