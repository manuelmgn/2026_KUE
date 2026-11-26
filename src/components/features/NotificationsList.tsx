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
  showPageHeader?: boolean;
  onSelectLink?: () => void;
}

type NotifFilter = "all" | "unread" | "festivals" | "social";

function formatShortTime(iso: string, locale: string): string {
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
  showPageHeader = false,
  onSelectLink,
}: NotificationsListProps) {
  const { dict, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItemDTO[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [filter, setFilter] = useState<NotifFilter>("all");
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

  const getTag = (item: NotificationItemDTO): string => {
    switch (item.type) {
      case "FRIEND_REQUEST_RECEIVED":
        return dict.notifications.tagFriendRequest;
      case "FRIEND_REQUEST_ACCEPTED":
        return dict.notifications.tagFriendAccepted;
      case "FESTIVAL_LINEUP_UPDATED":
        return dict.notifications.tagLineup;
      case "FESTIVAL_METADATA_UPDATED":
        return dict.notifications.tagMetadata;
      case "FRIEND_JOINED_FESTIVAL":
        return dict.notifications.tagFestivalJoined;
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

  const visibleItems = items.filter((item) => {
    if (filter === "unread") return item.readAt === null;
    if (filter === "festivals") {
      return item.type === "FESTIVAL_LINEUP_UPDATED" || item.type === "FESTIVAL_METADATA_UPDATED";
    }
    if (filter === "social") {
      return (
        item.type === "FRIEND_REQUEST_RECEIVED" ||
        item.type === "FRIEND_REQUEST_ACCEPTED" ||
        item.type === "FRIEND_JOINED_FESTIVAL"
      );
    }
    return true;
  });

  const filterTabs: Array<{ id: NotifFilter; label: string }> = [
    { id: "all", label: dict.notifications.filterAll },
    { id: "unread", label: dict.notifications.filterUnread(unreadCount) },
    { id: "festivals", label: dict.notifications.filterFestivals },
    { id: "social", label: dict.notifications.filterSocial },
  ];

  return (
    <div>
      {/* Compact 1-line header on phones/tablets; subtitle description ONLY on Desktop/Wide */}
      {showPageHeader ? (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-3.5 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h1
              data-page-heading
              className="font-display text-[1.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] sm:text-[2.2rem] desktop:text-[2.8rem]"
            >
              {dict.notifications.title}
            </h1>
            <p className="mt-1.5 hidden font-serif text-[1.1rem] italic text-ink-muted desktop:block">
              {dict.notifications.subtitle}
            </p>
          </div>

          {unreadCount > 0 ? (
            <HairlineButton
              size="sm"
              disabled={markingAll}
              onClick={() => void handleMarkAllRead()}
              className="shrink-0"
            >
              <span className="sm:hidden">
                {markingAll
                  ? dict.notifications.markingAllRead
                  : dict.notifications.shortMarkAll(unreadCount)}
              </span>
              <span className="hidden sm:inline">
                {markingAll ? dict.notifications.markingAllRead : dict.notifications.markAllRead}
              </span>
            </HairlineButton>
          ) : (
            <span className="shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
              {dict.notifications.allCaughtUp}
            </span>
          )}
        </div>
      ) : null}

      {/* Full-width 4-cell filter strip on Phone V (zero wasted horizontal space) */}
      <div className="grid h-10 grid-cols-4 border-b border-line bg-surface sm:flex sm:h-11 sm:items-stretch">
        {filterTabs.map((tab, idx) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`flex cursor-pointer items-center justify-center truncate px-1 font-mono text-[0.62rem] uppercase tracking-[0.04em] transition-colors sm:border-r sm:border-line sm:px-5 sm:text-[0.72rem] sm:tracking-[0.08em] ${
                idx < 3 ? "border-r border-line" : ""
              } ${
                isActive
                  ? "bg-acid font-semibold text-acid-ink"
                  : "text-ink hover:bg-surface-elevated"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-b border-line bg-surface px-3.5 py-2.5 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </p>
      ) : null}

      {visibleItems.length === 0 ? (
        <EmptyState
          title={dict.notifications.emptyTitle}
          description={dict.notifications.emptyDescription}
        />
      ) : (
        <ul>
          {visibleItems.map((item) => {
            const isUnread = item.readAt === null;
            const linkInfo = resolveTargetLink(item);
            const isBusy = busyId === item.id;
            const isPendingFriendReq =
              item.type === "FRIEND_REQUEST_RECEIVED" && item.pendingFriendshipId;

            return (
              <li
                key={item.id}
                className={`border-b border-line border-l-4 px-3.5 py-3 transition-colors last:border-b-0 sm:px-5 sm:py-3.5 ${
                  isUnread
                    ? "border-l-acid bg-surface"
                    : "border-l-transparent bg-bg opacity-80 hover:opacity-100"
                }`}
              >
                {/* Top micro-row: Tag left, Timestamp right */}
                <div className="flex items-center justify-between gap-2 font-mono text-[0.62rem] uppercase tracking-[0.06em]">
                  <span
                    className={
                      isUnread
                        ? "bg-acid px-1.5 py-0.5 font-semibold text-acid-ink"
                        : "border border-line px-1.5 py-0.5 text-ink-muted"
                    }
                  >
                    {getTag(item)}
                  </span>
                  <span className="shrink-0 text-ink-muted">
                    {formatShortTime(item.createdAt, locale)}
                  </span>
                </div>

                {/* Main row: Full-width title left + compact action button flush right */}
                <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-2.5">
                  <p className="min-w-0 font-display text-[0.96rem] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[1.05rem]">
                    {renderMessage(item)}
                  </p>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isPendingFriendReq ? (
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
                          ✕
                        </HairlineButton>
                      </>
                    ) : linkInfo ? (
                      <Link
                        href={linkInfo.href}
                        onClick={() => {
                          void handleMarkOneRead(item.id);
                          onSelectLink?.();
                        }}
                        className="inline-flex border border-line bg-bg px-2.5 py-1.5 font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated sm:px-3"
                      >
                        <span className="sm:hidden">{dict.notifications.shortOpen}</span>
                        <span className="hidden sm:inline">{linkInfo.label}</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
