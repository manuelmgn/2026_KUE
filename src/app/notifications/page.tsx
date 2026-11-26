import { Suspense } from "react";
import { NotificationsView } from "@/components/features/NotificationsView";
import { TopBar } from "@/components/features/TopBar";
import { requirePageUser } from "@/server/auth/dal";
import { listUserEditions } from "@/server/services/festivals";
import { resolveActiveFestival, toFestivalSummary } from "@/server/services/mappers";
import { listUserNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

interface NotificationsPageProps {
  searchParams: Promise<{ festival?: string }>;
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const user = await requirePageUser("/notifications");
  const [params, editions, snapshot] = await Promise.all([
    searchParams,
    listUserEditions(user.id),
    listUserNotifications(user.id, { limit: 60 }),
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
      <NotificationsView initialItems={snapshot.items} initialUnreadCount={snapshot.unreadCount} />
    </div>
  );
}
