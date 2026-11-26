import { AdminDashboardView } from "@/components/features/AdminDashboardView";
import type { CatalogFestivalDTO } from "@/components/features/types";
import { requirePageAdmin } from "@/server/auth/dal";
import { listAllCatalogFestivals } from "@/server/services/festivals";
import { getAdminDashboardData } from "@/server/services/users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requirePageAdmin();
  const [dashboard, rawCatalog] = await Promise.all([
    getAdminDashboardData(),
    listAllCatalogFestivals(admin.id),
  ]);

  const catalog: CatalogFestivalDTO[] = rawCatalog.map((fest) => ({
    id: fest.id,
    slug: fest.slug,
    name: fest.name,
    location: fest.location,
    locationProvince: fest.locationProvince,
    locationRegion: fest.locationRegion,
    locationCountry: fest.locationCountry,
    locationCountryCode: fest.locationCountryCode,
    locationLatitude: fest.locationLatitude,
    locationLongitude: fest.locationLongitude,
    locationPlaceId: fest.locationPlaceId,
    editions: fest.editions.map((ed) => ({
      id: ed.id,
      festivalId: fest.id,
      slug: ed.slug,
      year: ed.year,
      location: ed.location,
      startDate: ed.startDate ? ed.startDate.toISOString().slice(0, 10) : null,
      endDate: ed.endDate ? ed.endDate.toISOString().slice(0, 10) : null,
      entriesCount: ed._count.entries,
      followersCount: ed._count.followers,
      isAdded: ed.isAdded,
    })),
  }));

  return (
    <AdminDashboardView
      currentUserId={admin.id}
      initialStats={dashboard.stats}
      initialUsers={dashboard.users}
      initialCatalog={catalog}
    />
  );
}
