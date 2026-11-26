import { Suspense } from "react";
import { SocialHubView } from "@/components/features/SocialHubView";
import { TopBar } from "@/components/features/TopBar";
import { requirePageUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { listFriendsOverview } from "@/server/services/friends";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";
import { getUnreadNotificationCount } from "@/server/services/notifications";
import { listFriendsActivityFeed } from "@/server/services/profile";

export const dynamic = "force-dynamic";

interface SocialPageProps {
  searchParams: Promise<{ festival?: string; tab?: string }>;
}

export default async function SocialPage({ searchParams }: SocialPageProps) {
  const user = await requirePageUser("/social");
  const [params, editions, posts, overview, unreadCount] = await Promise.all([
    searchParams,
    listUserEditions(user.id),
    listFriendsActivityFeed(user.id, { limit: 40 }),
    listFriendsOverview(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  const summaries = editions.map(toFestivalSummary);
  const active = resolveActiveFestival(summaries, params.festival);
  const initialTab = params.tab === "friends" ? "friends" : "activity";

  return (
    <div className="min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="h-14 border-b border-line bg-bg" />}>
        <TopBar
          festivals={summaries}
          activeFestivalSlug={active?.slug ?? null}
          currentUser={user}
        />
      </Suspense>
      <SocialHubView
        currentUser={user}
        initialPosts={posts}
        initialFriends={overview.friends}
        initialIncoming={overview.incomingRequests}
        initialOutgoing={overview.outgoingRequests}
        unreadNotificationsCount={unreadCount}
        initialTab={initialTab}
      />
    </div>
  );
}
