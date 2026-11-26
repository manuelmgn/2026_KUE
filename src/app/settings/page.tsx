import { SettingsView } from "@/components/features/SettingsView";
import { requirePageUser } from "@/server/auth/dal";
import { getUnreadNotificationCount } from "@/server/services/notifications";
import { getOwnAccountProfileAndPrivacy } from "@/server/services/profile";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser("/settings");
  const [accountData, unreadCount] = await Promise.all([
    getOwnAccountProfileAndPrivacy(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <SettingsView
      currentUser={user}
      initialProfile={accountData.profile}
      initialPrivacy={accountData.privacy}
      unreadNotificationsCount={unreadCount}
    />
  );
}
