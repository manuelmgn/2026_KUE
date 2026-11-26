"use client";

import Link from "next/link";
import { NotificationsList } from "@/components/features/NotificationsList";
import type { NotificationItemDTO } from "@/components/features/types";
import { Drawer } from "@/components/ui/Drawer";
import { useI18n } from "@/i18n/context";

interface NotificationsViewProps {
  initialItems: NotificationItemDTO[];
  initialUnreadCount: number;
}

export function NotificationsView({ initialItems, initialUnreadCount }: NotificationsViewProps) {
  const { dict } = useI18n();

  return (
    <main className="mx-auto w-full max-w-[820px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
        <div>
          <h1 className="font-display text-[clamp(2rem,6vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
            {dict.notifications.title}
          </h1>
          <p className="mt-2 font-serif text-[1.15rem] italic text-ink-muted">
            {dict.notifications.subtitle}
          </p>
        </div>

        <Link
          href="/social"
          className="inline-flex border border-line px-3.5 py-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
        >
          {dict.notifications.backToSocial}
        </Link>
      </div>

      <NotificationsList initialItems={initialItems} initialUnreadCount={initialUnreadCount} />
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
