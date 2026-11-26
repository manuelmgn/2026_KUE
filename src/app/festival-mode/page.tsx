import { redirect } from "next/navigation";
import { festivalAgendaPath } from "@/domain/festival-routes";
import { requirePageUser } from "@/server/auth/dal";
import { getEditionBySlug, listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface LegacyFestivalModePageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function LegacyFestivalModeRedirectPage({
  searchParams,
}: LegacyFestivalModePageProps) {
  const user = await requirePageUser("/festival-mode");
  const [params, editions] = await Promise.all([searchParams, listUserEditions(user.id)]);

  const requested = params.festival
    ? (editions.find((ed) => ed.slug === params.festival) ??
      (await getEditionBySlug(params.festival)))
    : null;
  const target = requested ?? resolveActiveFestival(editions, params.festival);

  if (!target) {
    redirect("/festivals");
  }

  redirect(festivalAgendaPath({ brandSlug: target.festival.slug, year: target.year }));
}
