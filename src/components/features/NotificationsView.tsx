"use client";

import { NotificationsList } from "@/components/features/NotificationsList";
import type { NotificationItemDTO } from "@/components/features/types";
import { Drawer } from "@/components/ui/Drawer";
import { useI18n } from "@/i18n/context";

interface NotificationsViewProps {
  initialItems: NotificationItemDTO[];
  initialUnreadCount: number;
}

export function NotificationsView({ initialItems, initialUnreadCount }: NotificationsViewProps) {
  return (
    <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
      <NotificationsList
        initialItems={initialItems}
        initialUnreadCount={initialUnreadCount}
        showPageHeader
      />
    </main>
  );
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  items: NotificationItemDTO[];
  unreadCount: number;
}

export function NotificationsDrawer({
  open,
  onClose,
  items,
  unreadCount,
}: NotificationsDrawerProps) {
  const { dict } = useI18n();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      headerLabel={dict.notifications.title}
      ariaLabel={dict.notifications.title}
    >
      <NotificationsList
        initialItems={items}
        initialUnreadCount={unreadCount}
        onSelectLink={onClose}
      />
    </Drawer>
  );
}
