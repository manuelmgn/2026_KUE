"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  acceptFriendRequestAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  removeOrRejectFriendAction,
} from "@/actions/social-actions";
import type { NotificationItemDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { useI18n } from "@/i18n/context";

interface NotificationsListProps {
  initialItems: NotificationItemDTO[];
  initialUnreadCount: number;
  onSelectLink?: () => void;
}

function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsList({
  initialItems,
  initialUnreadCount,
  onSelectLink,
}: NotificationsListProps) {
  const { dict, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItemDTO[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setUnreadCount(initialUnreadCount);
  }, [initialItems, initialUnreadCount]);

  const handleMarkOneRead = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target || target.readAt !== null) {
      return;
    }
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, readAt: nowIso } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markNotificationReadAction(id);
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) {
      return;
    }
    setMarkingAll(true);
    setError(null);
    try {
      const res = await markAllNotificationsReadAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? nowIso })));
      setUnreadCount(0);
      router.refresh();
    } finally {
      setMarkingAll(false);
    }
  };

  const handleFriendDecision = async (notif: NotificationItemDTO, accept: boolean) => {
    if (!notif.actorId) {
      return;
    }
    setBusyId(notif.id);
    setError(null);
    try {
      const res = accept
        ? await acceptFriendRequestAction(notif.actorId)
        : await removeOrRejectFriendAction(notif.actorId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const nowIso = new Date().toISOString();
      const wasUnread = notif.readAt === null;
      setItems((prev) =>
        accept
          ? prev.map((item) =>
              item.id === notif.id
                ? { ...item, readAt: item.readAt ?? nowIso, pendingFriendshipId: null }
                : item,
            )
          : prev.filter((item) => item.id !== notif.id),
      );
      if (wasUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const renderMessage = (item: NotificationItemDTO): string => {
    const p = item.payload;
    const actor = p.actorUsername ?? "user";
    const festLabel = p.festivalName
      ? p.festivalYear
        ? `${p.festivalName} ${p.festivalYear}`
        : p.festivalName
      : "Festival";

    switch (item.type) {
      case "FRIEND_REQUEST_RECEIVED":
        return dict.notifications.friendRequestReceived(actor);
      case "FRIEND_REQUEST_ACCEPTED":
        return dict.notifications.friendRequestAccepted(actor);
      case "FESTIVAL_LINEUP_UPDATED":
        return dict.notifications.festivalLineupUpdated(
          festLabel,
          p.addedCount ?? 0,
          p.updatedCount ?? 0,
        );
      case "FESTIVAL_METADATA_UPDATED":
        return dict.notifications.festivalMetadataUpdated(festLabel);
      case "FRIEND_JOINED_FESTIVAL":
        return dict.notifications.friendJoinedFestival(actor, festLabel);
    }
  };

  const resolveTargetLink = (item: NotificationItemDTO): { href: string; label: string } | null => {
    const p = item.payload;
    if (
      (item.type === "FRIEND_REQUEST_RECEIVED" || item.type === "FRIEND_REQUEST_ACCEPTED") &&
      p.actorUsername
    ) {
      return {
        href: `/u/${encodeURIComponent(p.actorUsername)}`,
        label: dict.notifications.openProfileAction,
      };
    }
    if (p.festivalSlug) {
      return {
        href: `/lineup?festival=${encodeURIComponent(p.festivalSlug)}`,
        label: dict.notifications.openFestivalAction,
      };
    }
    return null;
  };

  return (
    <div>
      {unreadCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
          <span className="border border-acid bg-acid px-2 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-acid-ink">
            {dict.notifications.unreadBadge(unreadCount)}
          </span>
          <HairlineButton size="sm" disabled={markingAll} onClick={() => void handleMarkAllRead()}>
            {markingAll ? dict.notifications.markingAllRead : dict.notifications.markAllRead}
          </HairlineButton>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-b border-line bg-surface px-4 py-2.5 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={dict.notifications.emptyTitle}
          description={dict.notifications.emptyDescription}
        />
      ) : (
        <ul>
          {items.map((item) => {
            const isUnread = item.readAt === null;
            const linkInfo = resolveTargetLink(item);
            const isBusy = busyId === item.id;

            return (
              <li
                key={item.id}
                className={`border-b border-line transition-colors last:border-b-0 ${
                  isUnread ? "border-l-4 border-l-acid bg-surface pl-3 sm:pl-5" : "px-4 sm:px-6"
                } py-4 pr-4 sm:pr-6`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-sans text-[0.95rem] leading-snug text-ink">
                    {renderMessage(item)}
                  </p>
                  <span className="shrink-0 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
                    {formatDateTime(item.createdAt, locale)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.type === "FRIEND_REQUEST_RECEIVED" && item.pendingFriendshipId ? (
                    <>
                      <HairlineButton
                        size="sm"
                        variant="acid"
                        disabled={isBusy}
                        onClick={() => void handleFriendDecision(item, true)}
                      >
                        {dict.social.acceptAction}
                      </HairlineButton>
                      <HairlineButton
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleFriendDecision(item, false)}
                      >
                        {dict.social.rejectAction}
                      </HairlineButton>
                    </>
                  ) : null}

                  {linkInfo ? (
                    <Link
                      href={linkInfo.href}
                      onClick={() => {
                        void handleMarkOneRead(item.id);
                        onSelectLink?.();
                      }}
                      className="inline-flex border border-line px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
                    >
                      {linkInfo.label}
                    </Link>
                  ) : null}

                  {isUnread ? (
                    <button
                      type="button"
                      aria-label={dict.notifications.markReadAria}
                      onClick={() => void handleMarkOneRead(item.id)}
                      className="cursor-pointer font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted underline underline-offset-4 hover:text-ink"
                    >
                      ✓
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
