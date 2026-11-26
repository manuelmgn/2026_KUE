import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LineupWorkspace } from "@/components/features/LineupWorkspace";
import { ratingFilterSchema, statusFilterSchema, viewModeSchema } from "@/domain/schemas";
import { getServerDictionary } from "@/i18n/server";
import { requirePageUser } from "@/server/auth/dal";
import { listFestivalEntries } from "@/server/services/entries";
import { getEditionByBrandAndYear, isEditionInUserFestivals } from "@/server/services/festivals";
import { toLineupEntryDTO, toLocalizedFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface FestivalCartelPageProps {
  params: Promise<{ brandSlug: string; year: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    rating?: string;
    view?: string;
  }>;
}

export default async function FestivalCartelPage({
  params,
  searchParams,
}: FestivalCartelPageProps) {
  const { brandSlug, year: yearParam } = await params;
  const year = Number(yearParam);
  const user = await requirePageUser(
    `/festivals/${encodeURIComponent(brandSlug)}/${yearParam}/cartel`,
  );

  const [queryParams, { locale }, edition] = await Promise.all([
    searchParams,
    getServerDictionary(),
    getEditionByBrandAndYear(brandSlug, year),
  ]);

  if (!edition) {
    notFound();
  }

  const [festival, isInMyFestivals, rawEntries] = await Promise.all([
    toLocalizedFestivalSummary(edition, locale),
    isEditionInUserFestivals(user.id, edition.id),
    listFestivalEntries(user.id, edition.id),
  ]);

  const initialQuery = queryParams.q ?? "";
  const parsedStatus = statusFilterSchema.safeParse(queryParams.status);
  const initialStatus = parsedStatus.success ? parsedStatus.data : "ALL";
  const parsedRating = ratingFilterSchema.safeParse(queryParams.rating);
  const initialRating = parsedRating.success ? parsedRating.data : "ALL";
  const parsedView = viewModeSchema.safeParse(queryParams.view);
  const initialView = parsedView.success ? parsedView.data : "grid";

  return (
    <Suspense fallback={null}>
      <LineupWorkspace
        festival={festival}
        isInMyFestivals={isInMyFestivals}
        initialEntries={rawEntries.map(toLineupEntryDTO)}
        initialQuery={initialQuery}
        initialStatus={initialStatus}
        initialRating={initialRating}
        initialView={initialView}
      />
    </Suspense>
  );
}
