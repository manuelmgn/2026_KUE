import Link from "next/link";
import { Suspense } from "react";
import { LineupWorkspace } from "@/components/features/LineupWorkspace";
import { TopBar } from "@/components/features/TopBar";
import type { FestivalSummary, LineupEntryDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { ratingFilterSchema, statusFilterSchema, viewModeSchema } from "@/domain/schemas";
import { listFestivalEntries } from "@/server/services/entries";
import { getDefaultFestival, getFestivalBySlug, listFestivals } from "@/server/services/festivals";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams: Promise<{
    festival?: string;
    q?: string;
    status?: string;
    rating?: string;
    view?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const festivals = await listFestivals();
  const festivalSummaries: FestivalSummary[] = festivals.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    year: f.year,
    location: f.location,
  }));

  const activeFestival = params.festival
    ? ((await getFestivalBySlug(params.festival)) ?? (await getDefaultFestival()))
    : await getDefaultFestival();

  const initialQuery = params.q ?? "";
  const parsedStatus = statusFilterSchema.safeParse(params.status);
  const initialStatus = parsedStatus.success ? parsedStatus.data : "ALL";
  const parsedRating = ratingFilterSchema.safeParse(params.rating);
  const initialRating = parsedRating.success ? parsedRating.data : "ALL";
  const parsedView = viewModeSchema.safeParse(params.view);
  const initialView = parsedView.success ? parsedView.data : "grid";

  const rawEntries = activeFestival ? await listFestivalEntries(activeFestival.id) : [];
  const entries: LineupEntryDTO[] = rawEntries.map((entry) => ({
    id: entry.id,
    festivalId: entry.festivalId,
    billingName: entry.billingName,
    subtitle: entry.subtitle,
    day: entry.day,
    stage: entry.stage,
    setTime: entry.setTime,
    liveRating: entry.liveRating,
    liveNotes: entry.liveNotes,
    artists: entry.artists.map((link) => ({
      id: link.artist.id,
      name: link.artist.name,
      country: link.artist.country,
      imagePath: link.artist.imagePath,
      rating: link.artist.rating,
      status: link.artist.status,
      notes: link.artist.notes,
      syncStatus: link.artist.syncStatus,
    })),
  }));

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar festivals={festivalSummaries} activeFestivalSlug={activeFestival?.slug ?? null} />
      </Suspense>

      {activeFestival ? (
        <Suspense fallback={null}>
          <LineupWorkspace
            festival={{
              id: activeFestival.id,
              slug: activeFestival.slug,
              name: activeFestival.name,
              year: activeFestival.year,
              location: activeFestival.location,
            }}
            initialEntries={entries}
            initialQuery={initialQuery}
            initialStatus={initialStatus}
            initialRating={initialRating}
            initialView={initialView}
          />
        </Suspense>
      ) : (
        <EmptyState
          title="Empieza tu archivo"
          description="Crea tu primer festival y pega el cartel en bruto para empezar a escuchar y valorar."
          action={
            <Link
              href="/import"
              className="inline-flex border border-acid bg-acid px-5 py-3 font-mono text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              Ir al importador →
            </Link>
          }
        />
      )}
    </div>
  );
}
