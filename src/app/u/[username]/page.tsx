import { notFound } from "next/navigation";
import { UserProfileView } from "@/components/features/UserProfileView";
import { requirePageUser } from "@/server/auth/dal";
import { listFriendsOverview } from "@/server/services/friends";
import { getUserProfileByUsername } from "@/server/services/profile";

export const dynamic = "force-dynamic";

interface UserProfilePageProps {
  params: Promise<{ username: string }>;
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { username } = await params;
  const user = await requirePageUser(`/u/${encodeURIComponent(username)}`);

  const profile = await getUserProfileByUsername(user.id, username);

  if (!profile) {
    notFound();
  }

  const initialFriends =
    profile.relationship === "SELF" ? (await listFriendsOverview(user.id)).friends : [];

  return <UserProfileView initialProfile={profile} initialFriends={initialFriends} />;
}
