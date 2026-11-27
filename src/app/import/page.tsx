import { redirect } from "next/navigation";
import { festivalEditPath } from "@/domain/festival-routes";
import { requirePageUser } from "@/server/auth/dal";
import { getEditionBySlug, listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival } from "@/server/services/mappers";

export const dynamic = "force-dynamic";

interface LegacyImportPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function LegacyImportRedirectPage({ searchParams }: LegacyImportPageProps) {
  const user = await requirePageUser("/import");
  if (user.role !== "ADMIN") {
    redirect("/festivals");
  }
  const [params, editions] = await Promise.all([searchParams, listUserEditions(user.id)]);

  const requested = params.festival
    ? (editions.find((ed) => ed.slug === params.festival) ??
      (await getEditionBySlug(params.festival)))
    : null;
  const target = requested ?? resolveActiveFestival(editions, params.festival);

  if (!target) {
    redirect("/festivals");
  }

  redirect(festivalEditPath({ brandSlug: target.festival.slug, year: target.year }));
}
