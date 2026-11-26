import Link from "next/link";
import { Suspense } from "react";
import { LineupWorkspace } from "@/components/features/LineupWorkspace";
import { TopBar } from "@/components/features/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ratingFilterSchema, statusFilterSchema, viewModeSchema } from "@/domain/schemas";
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

interface LineupPageProps {
  searchParams: Promise<{
    festival?: string;
    q?: string;
    status?: string;
    rating?: string;
    view?: string;
  }>;
}

export default async function LineupPage({ searchParams }: LineupPageProps) {
  const user = await requirePageUser("/lineup");
  const [params, { locale, dict }, myEditions] = await Promise.all([
    searchParams,
    getServerDictionary(),
    listUserEditions(user.id),
  ]);

  const festivalSummaries = myEditions.map(toFestivalSummary);
  const requestedEdition = params.festival
    ? (myEditions.find((ed) => ed.slug === params.festival) ??
      (await getEditionBySlug(params.festival)))
    : null;
  const activeFestivalRaw = requestedEdition ?? resolveActiveFestival(myEditions, params.festival);
  const activeFestival = activeFestivalRaw
    ? await toLocalizedFestivalSummary(activeFestivalRaw, locale)
    : null;
  const isInMyFestivals = activeFestival
    ? myEditions.some((ed) => ed.id === activeFestival.id)
    : false;

  const initialQuery = params.q ?? "";
  const parsedStatus = statusFilterSchema.safeParse(params.status);
  const initialStatus = parsedStatus.success ? parsedStatus.data : "ALL";
  const parsedRating = ratingFilterSchema.safeParse(params.rating);
  const initialRating = parsedRating.success ? parsedRating.data : "ALL";
  const parsedView = viewModeSchema.safeParse(params.view);
  const initialView = parsedView.success ? parsedView.data : "grid";

  const entries = activeFestival
    ? (await listFestivalEntries(user.id, activeFestival.id)).map(toLineupEntryDTO)
    : [];

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={festivalSummaries}
          activeFestivalSlug={activeFestival?.slug ?? null}
          currentUser={user}
        />
      </Suspense>

      {activeFestival ? (
        <Suspense fallback={null}>
          <LineupWorkspace
            festival={activeFestival}
            isInMyFestivals={isInMyFestivals}
            initialEntries={entries}
            initialQuery={initialQuery}
            initialStatus={initialStatus}
            initialRating={initialRating}
            initialView={initialView}
          />
        </Suspense>
      ) : (
        <EmptyState
          title={dict.home.emptyTitle}
          description={dict.home.emptyDescription}
          action={
            <Link
              href="/festivals"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              {dict.home.emptyAction}
            </Link>
          }
        />
      )}
    </div>
  );
}
