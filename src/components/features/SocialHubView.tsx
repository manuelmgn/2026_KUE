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
  FriendRadarPickDTO,
  SharedFestivalMatchDTO,
  SocialPostItemDTO,
  UserSearchResultDTO,
} from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { festivalCartelPath, festivalHomePath } from "@/domain/festival-routes";
import { useI18n } from "@/i18n/context";

interface SocialHubViewProps {
  currentUser: AuthUserDTO;
  initialPosts: SocialPostItemDTO[];
  initialIncoming: FriendListItemDTO[];
  initialOutgoing: FriendListItemDTO[];
  sharedFestivals: SharedFestivalMatchDTO[];
  radarPicks: FriendRadarPickDTO[];
  myEditionIds: string[];
}

export function SocialHubView({
  currentUser,
  initialPosts,
  initialIncoming,
  initialOutgoing,
  sharedFestivals,
  radarPicks,
  myEditionIds,
}: SocialHubViewProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const searchInputId = useId();

  const [incoming, setIncoming] = useState<FriendListItemDTO[]>(initialIncoming);
  const [outgoing, setOutgoing] = useState<FriendListItemDTO[]>(initialOutgoing);
  const [reqTab, setReqTab] = useState<"received" | "sent">(
    initialIncoming.length > 0 ? "received" : "sent",
  );
  const [feedFilter, setFeedFilter] = useState<"all" | "my-festivals">("all");
  const [compactPanel, setCompactPanel] = useState<"shared" | "radar" | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResultDTO[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setIncoming((prev) => prev.filter((i) => i.id !== targetUserId));
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
      setIncoming((prev) => prev.filter((i) => i.id !== targetUserId));
      setOutgoing((prev) => prev.filter((i) => i.id !== targetUserId));
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === targetUserId ? { ...u, relationship: "NONE", friendshipId: null } : u,
        ),
      );
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  };

  const myEditionSet = new Set(myEditionIds);
  const filteredPosts =
    feedFilter === "my-festivals"
      ? initialPosts.filter((p) => p.festival && myEditionSet.has(p.festival.id))
      : initialPosts;

  const cleanedQuery = query.replace(/^@+/, "").trim();
  const hasIncoming = incoming.length > 0;
  const hasOutgoing = outgoing.length > 0;
  const hasPendingRequests = hasIncoming || hasOutgoing;
  const effectiveReqTab =
    reqTab === "received" && !hasIncoming
      ? "sent"
      : reqTab === "sent" && !hasOutgoing
        ? "received"
        : reqTab;

  const initials = currentUser.username.slice(0, 2).toUpperCase();

  const renderSearchBlock = () => (
    <section className="border-b border-line bg-surface px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2.5 border border-line bg-bg px-3 py-2 focus-within:border-acid">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          id={searchInputId}
          type="search"
          aria-label={dict.social.searchAria}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={dict.social.searchPlaceholder}
          className="w-full min-w-0 bg-transparent font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none"
        />
      </div>

      {cleanedQuery.length === 1 ? (
        <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">{dict.social.searchMinChars}</p>
      ) : searching ? (
        <p className="mt-2 font-mono text-[0.68rem] uppercase text-ink-muted">
          {dict.common.searching}
        </p>
      ) : cleanedQuery.length >= 2 && searchResults.length === 0 ? (
        <p className="mt-2 font-serif text-[0.98rem] italic text-ink-muted">
          {dict.social.searchNoResults(query.trim())}
        </p>
      ) : searchResults.length > 0 ? (
        <ul className="mt-3 border border-line bg-bg">
          {searchResults.map((candidate) => {
            const isBusy = busyUserId === candidate.id;
            return (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <Link
                  href={`/u/${encodeURIComponent(candidate.username)}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
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
                    <div className="truncate font-mono text-[0.66rem] text-ink-muted">
                      @{candidate.username}
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
                        ✕
                      </HairlineButton>
                    </>
                  ) : (
                    <span className="border border-acid bg-acid px-2 py-1 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-acid-ink">
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
  );

  // Strict rule: if there are 0 pending requests (incoming + outgoing), render NOTHING!
  const renderPendingRequests = () => {
    if (!hasPendingRequests) {
      return null;
    }

    return (
      <section className="border-b border-line">
        <div
          className={`grid border-b border-line font-mono text-[0.68rem] uppercase tracking-[0.06em] ${
            hasIncoming && hasOutgoing ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {hasIncoming ? (
            <button
              type="button"
              onClick={() => setReqTab("received")}
              className={`flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
                hasOutgoing ? "border-r border-line" : ""
              } ${
                effectiveReqTab === "received"
                  ? "bg-ink font-semibold text-bg"
                  : "bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              <span>{dict.social.incomingRequestsTitle(incoming.length)}</span>
              <span className="bg-acid px-1.5 py-0.5 text-[0.62rem] font-semibold leading-none text-acid-ink">
                {incoming.length}
              </span>
            </button>
          ) : null}

          {hasOutgoing ? (
            <button
              type="button"
              onClick={() => setReqTab("sent")}
              className={`flex cursor-pointer items-center justify-between px-4 py-2.5 transition-colors ${
                effectiveReqTab === "sent"
                  ? "bg-ink font-semibold text-bg"
                  : "bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              <span>{dict.social.outgoingRequestsTitle(outgoing.length)}</span>
              <span className="opacity-75">{outgoing.length}</span>
            </button>
          ) : null}
        </div>

        {effectiveReqTab === "received" ? (
          <ul>
            {incoming.map((req) => {
              const isBusy = busyUserId === req.id;
              return (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-2 border-b border-line border-l-4 border-l-acid bg-bg px-3.5 py-3 last:border-b-0 sm:px-4"
                >
                  <Link
                    href={`/u/${encodeURIComponent(req.username)}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <UserAvatar
                      avatarPath={req.avatarPath}
                      username={req.username}
                      displayName={req.displayName}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-extrabold text-ink">
                        @{req.username}
                      </div>
                      {req.sharedFestivalsCount > 0 ? (
                        <div className="truncate font-mono text-[0.64rem] uppercase text-ink-muted">
                          {dict.social.sharedFestivalsBadge(req.sharedFestivalsCount)}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
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
                      ✕
                    </HairlineButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul>
            {outgoing.map((req) => {
              const isBusy = busyUserId === req.id;
              return (
                <li
                  key={req.id}
                  className="flex items-center justify-between gap-2 border-b border-line bg-bg px-3.5 py-3 last:border-b-0 sm:px-4"
                >
                  <Link
                    href={`/u/${encodeURIComponent(req.username)}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <UserAvatar
                      avatarPath={req.avatarPath}
                      username={req.username}
                      displayName={req.displayName}
                      size="sm"
                    />
                    <span className="truncate font-display text-sm font-extrabold text-ink">
                      @{req.username}
                    </span>
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
        )}
      </section>
    );
  };

  const renderSharedFestivalsList = (compact: boolean) =>
    sharedFestivals.length === 0 ? null : (
      <div className={`grid ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2"}`}>
        {sharedFestivals.map((sf, idx) => (
          <div
            key={sf.editionId}
            className={`flex flex-col justify-between gap-2.5 border-b border-line p-4 ${
              idx % 2 === 0 ? "sm:border-r" : ""
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-extrabold uppercase tracking-[-0.02em] text-ink">
                  {sf.name} {sf.year}
                </span>
                {sf.averageRating !== null ? (
                  <span
                    className={`px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold uppercase ${
                      sf.averageRating >= 3.2
                        ? "bg-acid text-acid-ink"
                        : "border border-line text-ink"
                    }`}
                  >
                    {dict.social.groupAvg(sf.averageRating.toFixed(1))}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-serif text-[0.95rem] italic text-ink-muted">
                {dict.social.goingWith(sf.friendUsernames.map((u) => `@${u}`).join(", "))}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2 font-mono text-[0.64rem] uppercase">
              <span className="text-ink-muted">
                {sf.averageRating !== null && sf.averageRating >= 3.2
                  ? dict.social.recommendedBadge
                  : (sf.location ?? "")}
              </span>
              <Link
                href={festivalHomePath({ brandSlug: sf.brandSlug, year: sf.year })}
                className="font-semibold text-ink hover:underline"
              >
                {dict.social.compareAction}
              </Link>
            </div>
          </div>
        ))}
      </div>
    );

  const renderRadarList = (compact: boolean) =>
    radarPicks.length === 0 ? (
      <p className="px-4 py-4 font-serif text-[0.95rem] italic text-ink-muted">
        {dict.social.radarEmpty}
      </p>
    ) : (
      <div className={compact ? "grid grid-cols-1 sm:grid-cols-2" : "flex flex-col"}>
        {radarPicks.map((pick, idx) => (
          <Link
            key={`${pick.artistId}-${pick.editionId}`}
            href={festivalCartelPath(
              { brandSlug: pick.festivalBrandSlug, year: pick.festivalYear },
              { q: pick.artistName },
            )}
            className={`border-b border-line px-4 py-3 transition-colors hover:bg-surface ${
              compact && idx % 2 === 0 ? "sm:border-r" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-mono text-[0.62rem] uppercase">
              <span className="text-ink-muted">
                {pick.festivalName} {pick.festivalYear}
              </span>
              <span className="bg-acid px-1.5 py-0.5 font-semibold text-acid-ink">
                {pick.yourStatus === "LISTENING"
                  ? dict.drawer.statusListening
                  : dict.drawer.statusPending}
              </span>
            </div>
            <div className="mt-1 font-display text-[1rem] font-extrabold uppercase tracking-[-0.02em] text-ink">
              {pick.artistName}
            </div>
            <div className="mt-0.5 font-mono text-[0.66rem] text-ink-muted">
              {pick.backers.map((b) => `@${b.username} (${b.rating}/5)`).join(" · ")}
            </div>
          </Link>
        ))}
      </div>
    );

  const renderActivityFeed = () => (
    <section>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 sm:px-5">
        <h2 className="truncate font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
          {dict.social.tabActivity}
        </h2>
        <div className="flex shrink-0 border border-line bg-bg font-mono text-[0.64rem] uppercase tracking-[0.06em]">
          <button
            type="button"
            onClick={() => setFeedFilter("all")}
            className={`cursor-pointer border-r border-line px-2.5 py-1 transition-colors ${
              feedFilter === "all"
                ? "bg-ink font-semibold text-bg"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {dict.social.filterAll}
          </button>
          <button
            type="button"
            onClick={() => setFeedFilter("my-festivals")}
            className={`cursor-pointer px-2.5 py-1 transition-colors ${
              feedFilter === "my-festivals"
                ? "bg-ink font-semibold text-bg"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {dict.social.filterMyFestivals}
          </button>
        </div>
      </div>

      {filteredPosts.length === 0 ? (
        <EmptyState
          title={dict.social.emptyFeedTitle}
          description={dict.social.emptyFeedDescription}
        />
      ) : (
        <SocialPostList posts={filteredPosts} showAuthor />
      )}
    </section>
  );

  return (
    <main className="w-full min-h-[calc(100dvh-3rem)] sm:min-h-dvh">
      {/* Header with prominent My Profile button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <h1
            data-page-heading
            className="font-display text-[clamp(1.75rem,5vw,3.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
          >
            {dict.social.title}
          </h1>
          <p className="mt-1 hidden font-serif text-[1.1rem] italic text-ink-muted desktop:block">
            {dict.social.subtitle}
          </p>
        </div>

        <Link
          href={`/u/${encodeURIComponent(currentUser.username)}`}
          className="inline-flex items-center gap-2.5 border border-line bg-surface px-3.5 py-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink"
        >
          <span className="flex h-5 w-5 items-center justify-center bg-acid font-mono text-[0.62rem] font-semibold text-acid-ink">
            {initials}
          </span>
          <span className="font-semibold">{dict.social.myProfileLink}</span>
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-b border-line bg-surface px-4 py-2.5 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </p>
      ) : null}

      {/* TIERS 1, 2a, 2b (< 960px): Compact view with 2 high-contrast graphic toggle tiles */}
      <div className="flex flex-col tablet-h:hidden">
        {renderSearchBlock()}
        {renderPendingRequests()}

        {/* 2 Graphic Poster Buttons (50% Acid #CCFF00 + 50% Inverted with #CCFF00 badge) */}
        <section className="border-b border-line-strong">
          <div className="grid grid-cols-2">
            <button
              type="button"
              aria-expanded={compactPanel === "shared"}
              onClick={() => setCompactPanel((prev) => (prev === "shared" ? null : "shared"))}
              className="flex cursor-pointer flex-col justify-between gap-2.5 border-r border-line-strong bg-acid p-3.5 text-left text-acid-ink transition-opacity hover:opacity-95"
            >
              <div className="flex w-full items-center justify-between font-mono text-[0.6rem] font-semibold uppercase tracking-[0.06em]">
                <span>{dict.social.sharedFestivalsShort}</span>
                <span className="border border-acid-ink/40 px-1.5 py-0.5">
                  {sharedFestivals.length} {compactPanel === "shared" ? "▴" : "▾"}
                </span>
              </div>
              <div className="font-display text-[1.1rem] font-extrabold uppercase leading-[0.96] tracking-[-0.03em]">
                {dict.social.sharedFestivalsTitle}
              </div>
            </button>

            <button
              type="button"
              aria-expanded={compactPanel === "radar"}
              onClick={() => setCompactPanel((prev) => (prev === "radar" ? null : "radar"))}
              className="flex cursor-pointer flex-col justify-between gap-2.5 bg-ink p-3.5 text-left text-bg transition-opacity hover:opacity-95"
            >
              <div className="flex w-full items-center justify-between font-mono text-[0.6rem] font-semibold uppercase tracking-[0.06em]">
                <span>{dict.social.radarShort}</span>
                <span className="bg-acid px-1.5 py-0.5 font-semibold text-acid-ink">
                  {radarPicks.length} {compactPanel === "radar" ? "▴" : "▾"}
                </span>
              </div>
              <div className="font-display text-[1.1rem] font-extrabold uppercase leading-[0.96] tracking-[-0.03em]">
                {dict.social.radarTitle}
              </div>
            </button>
          </div>

          {compactPanel === "shared" ? (
            <div className="border-t border-line-strong border-l-4 border-l-acid bg-surface">
              {sharedFestivals.length === 0 ? (
                <p className="px-4 py-4 font-serif text-[0.95rem] italic text-ink-muted">
                  {dict.social.emptyFriendsDescription}
                </p>
              ) : (
                renderSharedFestivalsList(true)
              )}
            </div>
          ) : null}

          {compactPanel === "radar" ? (
            <div className="border-t border-line-strong border-l-4 border-l-ink bg-surface">
              {renderRadarList(true)}
            </div>
          ) : null}
        </section>

        {renderActivityFeed()}
      </div>

      {/* TIERS 3–5 (>= 960px Tablet H / Desktop / Wide): Full 2-column layout */}
      <div className="hidden tablet-h:grid tablet-h:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0">
          {sharedFestivals.length > 0 ? (
            <section className="border-b border-line">
              <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.08em]">
                <h2 className="font-semibold text-ink">{dict.social.sharedFestivalsTitle}</h2>
                <span className="text-ink-muted">{sharedFestivals.length}</span>
              </div>
              {renderSharedFestivalsList(false)}
            </section>
          ) : null}
          {renderActivityFeed()}
        </div>

        <div className="min-w-0 border-l border-line">
          {renderSearchBlock()}
          {renderPendingRequests()}

          <section>
            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-[0.08em]">
              <h2 className="font-semibold text-ink">{dict.social.radarTitle}</h2>
              <span className="text-ink-muted">{radarPicks.length}</span>
            </div>
            {renderRadarList(false)}
          </section>
        </div>
      </div>
    </main>
  );
}
