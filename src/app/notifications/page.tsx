import { NotificationsView } from "@/components/features/NotificationsView";
import { requirePageUser } from "@/server/auth/dal";
import { listUserNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requirePageUser("/notifications");
  const snapshot = await listUserNotifications(user.id, { limit: 60 });

  return (
    <NotificationsView initialItems={snapshot.items} initialUnreadCount={snapshot.unreadCount} />
  );
}
