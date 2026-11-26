import { redirect } from "next/navigation";
import { festivalCartelPath } from "@/domain/festival-routes";
import { requirePageUser } from "@/server/auth/dal";
import { getEditionBySlug, listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface LegacyLineupPageProps {
  searchParams: Promise<{
    festival?: string;
    q?: string;
    status?: string;
    rating?: string;
    view?: string;
  }>;
}

export default async function LegacyLineupRedirectPage({ searchParams }: LegacyLineupPageProps) {
  const user = await requirePageUser("/lineup");
  const [params, myEditions] = await Promise.all([searchParams, listUserEditions(user.id)]);

  const requested = params.festival
    ? (myEditions.find((ed) => ed.slug === params.festival) ??
      (await getEditionBySlug(params.festival)))
    : null;
  const target = requested ?? resolveActiveFestival(myEditions, params.festival);

  if (!target) {
    redirect("/festivals");
  }

  redirect(
    festivalCartelPath(
      { brandSlug: target.festival.slug, year: target.year },
      {
        q: params.q,
        status: params.status,
        rating: params.rating,
        view: params.view,
      },
    ),
  );
}
