"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  acceptFriendRequestAction,
  removeOrRejectFriendAction,
  searchUsersAction,
  sendFriendRequestAction,
} from "@/actions/social-actions";
import { SocialPostList } from "@/components/features/SocialPostList";
import type {
  AuthUserDTO,
  FriendListItemDTO,
  SocialPostItemDTO,
  UserSearchResultDTO,
} from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useI18n } from "@/i18n/context";

interface SocialHubViewProps {
  currentUser: AuthUserDTO;
  initialPosts: SocialPostItemDTO[];
  initialFriends: FriendListItemDTO[];
  initialIncoming: FriendListItemDTO[];
  initialOutgoing: FriendListItemDTO[];
  unreadNotificationsCount: number;
  initialTab?: "activity" | "friends";
}

export function SocialHubView({
  currentUser,
  initialPosts,
  initialFriends,
  initialIncoming,
  initialOutgoing,
  unreadNotificationsCount,
  initialTab = "activity",
}: SocialHubViewProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const searchInputId = useId();

  const [tab, setTab] = useState<"activity" | "friends">(
    initialIncoming.length > 0 && initialPosts.length === 0 ? "friends" : initialTab,
  );
  const [friends, setFriends] = useState<FriendListItemDTO[]>(initialFriends);
  const [incoming, setIncoming] = useState<FriendListItemDTO[]>(initialIncoming);
  const [outgoing, setOutgoing] = useState<FriendListItemDTO[]>(initialOutgoing);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResultDTO[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFriends(initialFriends);
  }, [initialFriends]);

  useEffect(() => {
    setIncoming(initialIncoming);
  }, [initialIncoming]);

  useEffect(() => {
    setOutgoing(initialOutgoing);
  }, [initialOutgoing]);

  useEffect(() => {
    const trimmed = query.replace(/^@+/, "").trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchUsersAction(query)
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            setSearchResults(res.data);
          } else {
            setError(res.error);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSendRequest = async (candidate: UserSearchResultDTO) => {
    setBusyUserId(candidate.id);
    setError(null);
    try {
      const res = await sendFriendRequestAction(candidate.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === candidate.id
            ? {
                ...u,
                relationship: res.data.status === "ACCEPTED" ? "FRIENDS" : "OUTGOING_PENDING",
                friendshipId: res.data.friendshipId,
              }
            : u,
        ),
      );
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAccept = async (targetUserId: string) => {
    setBusyUserId(targetUserId);
    setError(null);
    try {
      const res = await acceptFriendRequestAction(targetUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const acceptedItem = incoming.find((i) => i.id === targetUserId);
      if (acceptedItem) {
        setIncoming((prev) => prev.filter((i) => i.id !== targetUserId));
        setFriends((prev) =>
          [...prev, { ...acceptedItem, status: "ACCEPTED" as const }].sort((a, b) =>
            a.username.localeCompare(b.username),
          ),
        );
      }
      setSearchResults((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, relationship: "FRIENDS" } : u)),
      );
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemoveOrReject = async (targetUserId: string) => {
    setBusyUserId(targetUserId);
    setError(null);
    try {
      const res = await removeOrRejectFriendAction(targetUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFriends((prev) => prev.filter((i) => i.id !== targetUserId));
      setIncoming((prev) => prev.filter((i) => i.id !== targetUserId));
      setOutgoing((prev) => prev.filter((i) => i.id !== targetUserId));
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === targetUserId ? { ...u, relationship: "NONE", friendshipId: null } : u,
        ),
      );
      setConfirmRemoveId(null);
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  };

  const cleanedQuery = query.replace(/^@+/, "").trim();

  return (
    <main className="mx-auto w-full max-w-[920px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
        <div>
          <h1 className="font-display text-[clamp(2rem,6vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
            {dict.social.title}
          </h1>
          <p className="mt-2 font-serif text-[1.15rem] italic text-ink-muted">
            {dict.social.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/notifications"
            className={
              unreadNotificationsCount > 0
                ? "inline-flex border border-acid bg-acid px-3.5 py-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                : "inline-flex border border-line px-3.5 py-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
            }
          >
            {dict.social.notificationsLink(unreadNotificationsCount)}
          </Link>
          <Link
            href={`/u/${encodeURIComponent(currentUser.username)}`}
            className="inline-flex border border-line px-3.5 py-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
          >
            {dict.social.myProfileLink}
          </Link>
        </div>
      </div>

      {/* Single-line Tab Bar */}
      <div
        role="tablist"
        aria-label={dict.social.title}
        className="grid h-[48px] grid-cols-2 border-b border-line"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          onClick={() => setTab("activity")}
          className={`cursor-pointer border-r border-line px-4 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            tab === "activity"
              ? "bg-ink font-semibold text-bg"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.social.tabActivity}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "friends"}
          onClick={() => setTab("friends")}
          className={`flex cursor-pointer items-center justify-center gap-2 px-4 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            tab === "friends"
              ? "bg-ink font-semibold text-bg"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          <span>{dict.social.tabFriends(friends.length)}</span>
          {incoming.length > 0 ? (
            <span className="border border-acid bg-acid px-1.5 py-0.5 text-[0.64rem] font-semibold leading-none text-acid-ink">
              +{incoming.length}
            </span>
          ) : null}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-b border-line bg-surface px-4 py-2.5 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </p>
      ) : null}

      {tab === "activity" ? (
        initialPosts.length === 0 ? (
          <EmptyState
            title={dict.social.emptyFeedTitle}
            description={dict.social.emptyFeedDescription}
            action={
              <HairlineButton variant="acid" onClick={() => setTab("friends")}>
                {dict.social.tabFriends(friends.length)}
              </HairlineButton>
            }
          />
        ) : (
          <SocialPostList posts={initialPosts} showAuthor />
        )
      ) : (
        <div>
          {/* User Search */}
          <section className="border-b border-line bg-surface px-4 py-4 sm:px-6">
            <label
              htmlFor={searchInputId}
              className="block font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink"
            >
              {dict.social.searchTitle}
            </label>
            <input
              id={searchInputId}
              type="search"
              aria-label={dict.social.searchAria}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={dict.social.searchPlaceholder}
              className="mt-2 w-full border border-line bg-bg px-3.5 py-2.5 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
            />

            {cleanedQuery.length === 1 ? (
              <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
                {dict.social.searchMinChars}
              </p>
            ) : searching ? (
              <p className="mt-2 font-mono text-[0.68rem] uppercase text-ink-muted">
                {dict.common.searching}
              </p>
            ) : cleanedQuery.length >= 2 && searchResults.length === 0 ? (
              <p className="mt-2 font-serif text-[1rem] italic text-ink-muted">
                {dict.social.searchNoResults(query.trim())}
              </p>
            ) : searchResults.length > 0 ? (
              <ul className="mt-3 border border-line bg-bg">
                {searchResults.map((candidate) => {
                  const isBusy = busyUserId === candidate.id;
                  return (
                    <li
                      key={candidate.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3.5 py-3 last:border-b-0"
                    >
                      <Link
                        href={`/u/${encodeURIComponent(candidate.username)}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <UserAvatar
                          avatarPath={candidate.avatarPath}
                          username={candidate.username}
                          displayName={candidate.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-display text-sm font-extrabold text-ink">
                            {candidate.displayName || `@${candidate.username}`}
                          </div>
                          <div className="truncate font-mono text-[0.68rem] text-ink-muted">
                            @{candidate.username}
                            {candidate.location ? ` · ${candidate.location}` : ""}
                          </div>
                        </div>
                      </Link>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {candidate.relationship === "NONE" ? (
                          <HairlineButton
                            size="sm"
                            variant="acid"
                            disabled={isBusy}
                            onClick={() => void handleSendRequest(candidate)}
                          >
                            {dict.social.addFriendAction}
                          </HairlineButton>
                        ) : candidate.relationship === "OUTGOING_PENDING" ? (
                          <HairlineButton
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleRemoveOrReject(candidate.id)}
                          >
                            {dict.social.cancelRequestAction}
                          </HairlineButton>
                        ) : candidate.relationship === "INCOMING_PENDING" ? (
                          <>
                            <HairlineButton
                              size="sm"
                              variant="acid"
                              disabled={isBusy}
                              onClick={() => void handleAccept(candidate.id)}
                            >
                              {dict.social.acceptAction}
                            </HairlineButton>
                            <HairlineButton
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void handleRemoveOrReject(candidate.id)}
                            >
                              {dict.social.rejectAction}
                            </HairlineButton>
                          </>
                        ) : (
                          <span className="border border-acid bg-acid px-2 py-1 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-acid-ink">
                            {dict.social.friendsBadge}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          {/* Incoming Friend Requests */}
          {incoming.length > 0 ? (
            <section className="border-b border-line">
              <div className="border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink sm:px-6">
                {dict.social.incomingRequestsTitle(incoming.length)}
              </div>
              <ul>
                {incoming.map((req) => {
                  const isBusy = busyUserId === req.id;
                  return (
                    <li
                      key={req.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-line border-l-4 border-l-acid px-4 py-3.5 last:border-b-0 sm:px-5"
                    >
                      <Link
                        href={`/u/${encodeURIComponent(req.username)}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <UserAvatar
                          avatarPath={req.avatarPath}
                          username={req.username}
                          displayName={req.displayName}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-display text-base font-extrabold text-ink">
                            {req.displayName || `@${req.username}`}
                          </div>
                          <div className="truncate font-mono text-xs text-ink-muted">
                            @{req.username}
                          </div>
                        </div>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <HairlineButton
                          size="sm"
                          variant="acid"
                          disabled={isBusy}
                          onClick={() => void handleAccept(req.id)}
                        >
                          {dict.social.acceptAction}
                        </HairlineButton>
                        <HairlineButton
                          size="sm"
                          disabled={isBusy}
                          onClick={() => void handleRemoveOrReject(req.id)}
                        >
                          {dict.social.rejectAction}
                        </HairlineButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Outgoing Friend Requests */}
          {outgoing.length > 0 ? (
            <section className="border-b border-line">
              <div className="border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted sm:px-6">
                {dict.social.outgoingRequestsTitle(outgoing.length)}
              </div>
              <ul>
                {outgoing.map((req) => {
                  const isBusy = busyUserId === req.id;
                  return (
                    <li
                      key={req.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-6"
                    >
                      <Link
                        href={`/u/${encodeURIComponent(req.username)}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <UserAvatar
                          avatarPath={req.avatarPath}
                          username={req.username}
                          displayName={req.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-display text-sm font-extrabold text-ink">
                            {req.displayName || `@${req.username}`}
                          </div>
                          <div className="truncate font-mono text-[0.68rem] text-ink-muted">
                            @{req.username}
                          </div>
                        </div>
                      </Link>
                      <HairlineButton
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void handleRemoveOrReject(req.id)}
                      >
                        {dict.social.cancelRequestAction}
                      </HairlineButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Friends List */}
          <section>
            <div className="border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink sm:px-6">
              {dict.social.friendsListTitle(friends.length)}
            </div>

            {friends.length === 0 ? (
              <EmptyState
                title={dict.social.emptyFriendsTitle}
                description={dict.social.emptyFriendsDescription}
              />
            ) : (
              <ul>
                {friends.map((friend) => {
                  const isBusy = busyUserId === friend.id;
                  const confirming = confirmRemoveId === friend.id;
                  return (
                    <li
                      key={friend.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 transition-colors hover:bg-surface last:border-b-0 sm:px-6"
                    >
                      <Link
                        href={`/u/${encodeURIComponent(friend.username)}`}
                        className="flex min-w-0 flex-1 items-center gap-3.5"
                      >
                        <UserAvatar
                          avatarPath={friend.avatarPath}
                          username={friend.username}
                          displayName={friend.displayName}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-display text-[1.08rem] font-extrabold text-ink">
                              {friend.displayName || `@${friend.username}`}
                            </span>
                            {friend.sharedFestivalsCount > 0 ? (
                              <span className="border border-acid bg-acid px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-acid-ink">
                                {dict.social.sharedFestivalsBadge(friend.sharedFestivalsCount)}
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate font-mono text-xs text-ink-muted">
                            @{friend.username}
                            {friend.location ? ` · ${friend.location}` : ""}
                          </div>
                          {friend.bio ? (
                            <p className="mt-0.5 line-clamp-1 font-serif text-[0.96rem] italic text-ink-muted">
                              {friend.bio}
                            </p>
                          ) : null}
                        </div>
                      </Link>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {confirming ? (
                          <>
                            <HairlineButton
                              size="sm"
                              variant="inverted"
                              disabled={isBusy}
                              onClick={() => void handleRemoveOrReject(friend.id)}
                            >
                              {dict.social.removeFriendAction}
                            </HairlineButton>
                            <HairlineButton
                              size="sm"
                              disabled={isBusy}
                              onClick={() => setConfirmRemoveId(null)}
                            >
                              {dict.common.close}
                            </HairlineButton>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(friend.id)}
                            className="cursor-pointer border border-line px-2 py-1 font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
