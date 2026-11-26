import { SearchView } from "@/components/features/SearchView";
import { requirePageUser } from "@/server/auth/dal";
import { searchCatalogArtists } from "@/server/services/artists";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await requirePageUser("/search");
  const params = await searchParams;
  const initialQuery = params.q ?? "";
  const initialArtists = await searchCatalogArtists(user.id, initialQuery, 48);

  return <SearchView initialArtists={initialArtists} initialQuery={initialQuery} />;
}
