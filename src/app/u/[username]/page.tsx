import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TopBar } from "@/components/features/TopBar";
import { UserProfileView } from "@/components/features/UserProfileView";
import { requirePageUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";
import { getUserProfileByUsername } from "@/server/services/profile";

export const dynamic = "force-dynamic";

interface UserProfilePageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ festival?: string }>;
}

export default async function UserProfilePage({ params, searchParams }: UserProfilePageProps) {
  const { username } = await params;
  const user = await requirePageUser(`/u/${encodeURIComponent(username)}`);

  const [query, editions, profile] = await Promise.all([
    searchParams,
    listUserEditions(user.id),
    getUserProfileByUsername(user.id, username),
  ]);

  if (!profile) {
    notFound();
  }

  const summaries = editions.map(toFestivalSummary);
  const active = resolveActiveFestival(summaries, query.festival);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={summaries}
          activeFestivalSlug={active?.slug ?? null}
          currentUser={user}
        />
      </Suspense>
      <UserProfileView initialProfile={profile} />
    </div>
  );
}
