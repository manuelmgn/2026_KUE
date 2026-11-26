import { Suspense } from "react";
import { RawImporter } from "@/components/features/RawImporter";
import { TopBar } from "@/components/features/TopBar";
import { requirePageUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface ImportPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const user = await requirePageUser("/import");
  const [params, editions] = await Promise.all([searchParams, listUserEditions(user.id)]);
  const summaries = editions.map(toFestivalSummary);
  const active = resolveActiveFestival(summaries, params.festival);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={summaries}
          activeFestivalSlug={active?.slug ?? null}
          currentUser={user}
        />
      </Suspense>
      <RawImporter festivals={summaries} initialFestivalId={active?.id ?? null} />
    </div>
  );
}
