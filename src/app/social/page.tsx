import { SocialHubView } from "@/components/features/SocialHubView";
import { requirePageUser } from "@/server/auth/dal";
import { listFriendsOverview } from "@/server/services/friends";
import { getSocialInsights, listFriendsActivityFeed } from "@/server/services/profile";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const user = await requirePageUser("/social");
  const [posts, overview, insights] = await Promise.all([
    listFriendsActivityFeed(user.id, { limit: 50 }),
    listFriendsOverview(user.id),
    getSocialInsights(user.id),
  ]);

  return (
    <SocialHubView
      currentUser={user}
      initialPosts={posts}
      initialIncoming={overview.incomingRequests}
      initialOutgoing={overview.outgoingRequests}
      sharedFestivals={insights.sharedFestivals}
      radarPicks={insights.radarPicks}
      myEditionIds={insights.myEditionIds}
    />
  );
}
