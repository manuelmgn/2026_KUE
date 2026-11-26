import { Suspense } from "react";
import { SettingsView } from "@/components/features/SettingsView";
import { TopBar } from "@/components/features/TopBar";
import { requirePageUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";
import { getUnreadNotificationCount } from "@/server/services/notifications";
import { getOwnAccountProfileAndPrivacy } from "@/server/services/profile";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requirePageUser("/settings");
  const [params, editions, accountData, unreadCount] = await Promise.all([
    searchParams,
    listUserEditions(user.id),
    getOwnAccountProfileAndPrivacy(user.id),
    getUnreadNotificationCount(user.id),
  ]);
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
      <SettingsView
        currentUser={user}
        initialProfile={accountData.profile}
        initialPrivacy={accountData.privacy}
        unreadNotificationsCount={unreadCount}
      />
    </div>
  );
}
