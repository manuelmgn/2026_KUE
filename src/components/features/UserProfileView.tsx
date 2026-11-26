"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import {
  acceptFriendRequestAction,
  removeOrRejectFriendAction,
  sendFriendRequestAction,
  updateProfileAction,
} from "@/actions/social-actions";
import { SocialPostList } from "@/components/features/SocialPostList";
import type { UserProfileViewDTO } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { prepareAvatarUploadFile } from "@/domain/avatar-client";
import { useI18n } from "@/i18n/context";

interface UserProfileViewProps {
  initialProfile: UserProfileViewDTO;
}

export function UserProfileView({ initialProfile }: UserProfileViewProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfileViewDTO>(initialProfile);
  const [tab, setTab] = useState<"posts" | "festivals">("posts");
  const [editing, setEditing] = useState(false);

  const [displayName, setDisplayName] = useState(initialProfile.user.displayName ?? "");
  const [location, setLocation] = useState(initialProfile.user.location ?? "");
  const [bio, setBio] = useState(initialProfile.user.bio);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [busyFriendAction, setBusyFriendAction] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSelf = profile.relationship === "SELF";

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateProfileAction({
        displayName: displayName.trim() || null,
        location: location.trim() || null,
        bio: bio.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProfile((prev) => ({ ...prev, user: res.data }));
      setEditing(false);
      setNotice(dict.profile.profileSaved);
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = event.target.files?.[0];
    event.target.value = "";
    if (!rawFile) {
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    setNotice(null);

    try {
      let prepared: File;
      try {
        prepared = await prepareAvatarUploadFile(rawFile);
      } catch {
        setError(dict.profile.avatarTooLargeError);
        return;
      }

      const formData = new FormData();
      formData.set("file", prepared);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        avatarPath?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.avatarPath) {
        setError(payload.error ?? dict.errors.avatarUpload);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, avatarPath: payload.avatarPath ?? null },
      }));
      setNotice(dict.profile.profileSaved);
      router.refresh();
    } catch {
      setError(dict.errors.avatarUpload);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!response.ok) {
        setError(dict.errors.avatarUpload);
        return;
      }
      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, avatarPath: null },
      }));
      router.refresh();
    } catch {
      setError(dict.errors.avatarUpload);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSendFriendRequest = async () => {
    setBusyFriendAction(true);
    setError(null);
    try {
      const res = await sendFriendRequestAction(profile.user.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProfile((prev) => ({
        ...prev,
        relationship: res.data.status === "ACCEPTED" ? "FRIENDS" : "OUTGOING_PENDING",
        friendshipId: res.data.friendshipId,
      }));
      router.refresh();
    } finally {
      setBusyFriendAction(false);
    }
  };

  const handleAcceptFriend = async () => {
    setBusyFriendAction(true);
    setError(null);
    try {
      const res = await acceptFriendRequestAction(profile.user.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProfile((prev) => ({
        ...prev,
        relationship: "FRIENDS",
        friendshipId: res.data.friendshipId,
      }));
      router.refresh();
    } finally {
      setBusyFriendAction(false);
    }
  };

  const handleRemoveOrReject = async () => {
    setBusyFriendAction(true);
    setError(null);
    try {
      const res = await removeOrRejectFriendAction(profile.user.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmUnfriend(false);
      setProfile((prev) => ({
        ...prev,
        relationship: "NONE",
        friendshipId: null,
        canViewFestivals: false,
        canViewRatings: false,
        canViewNotes: false,
        canViewActivity: false,
        sharedFestivals: [],
        festivals: [],
        posts: [],
      }));
      router.refresh();
    } finally {
      setBusyFriendAction(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[920px] min-h-[calc(100dvh-56px)] md:border-x md:border-line">
      {/* Editorial Profile Hero */}
      <section className="border-b border-line px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            <UserAvatar
              avatarPath={profile.user.avatarPath}
              username={profile.user.username}
              displayName={profile.user.displayName}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-[clamp(1.75rem,5vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-ink">
                {profile.user.displayName || `@${profile.user.username}`}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs uppercase tracking-[0.06em] text-ink-muted">
                <span>@{profile.user.username}</span>
                {profile.user.location ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{profile.user.location}</span>
                  </>
                ) : null}
                {profile.friendsCount !== null ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{dict.profile.friendsStat(profile.friendsCount)}</span>
                  </>
                ) : null}
              </div>

              {profile.user.bio ? (
                <p className="mt-3 max-w-[540px] whitespace-pre-line font-serif text-[1.18rem] italic leading-[1.38] text-ink">
                  {profile.user.bio}
                </p>
              ) : null}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {isSelf ? (
              <>
                <HairlineButton
                  variant={editing ? "default" : "acid"}
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setEditing((prev) => !prev);
                  }}
                >
                  {editing ? dict.profile.cancelEditButton : dict.profile.editProfileButton}
                </HairlineButton>
                <Link
                  href="/social"
                  className="inline-flex border border-line px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-surface-elevated"
                >
                  {dict.social.title} →
                </Link>
                <Link
                  href="/settings#privacy"
                  className="inline-flex border border-line px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  {dict.profile.privacySettingsLink}
                </Link>
              </>
            ) : profile.relationship === "NONE" ? (
              <HairlineButton
                variant="acid"
                size="md"
                disabled={busyFriendAction}
                onClick={() => void handleSendFriendRequest()}
              >
                {dict.social.addFriendAction}
              </HairlineButton>
            ) : profile.relationship === "OUTGOING_PENDING" ? (
              <div className="flex items-center gap-2">
                <span className="border border-line px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted">
                  {dict.social.pendingBadge}
                </span>
                <HairlineButton
                  size="sm"
                  disabled={busyFriendAction}
                  onClick={() => void handleRemoveOrReject()}
                >
                  {dict.social.cancelRequestAction}
                </HairlineButton>
              </div>
            ) : profile.relationship === "INCOMING_PENDING" ? (
              <div className="flex items-center gap-2">
                <HairlineButton
                  variant="acid"
                  size="sm"
                  disabled={busyFriendAction}
                  onClick={() => void handleAcceptFriend()}
                >
                  {dict.social.acceptAction}
                </HairlineButton>
                <HairlineButton
                  size="sm"
                  disabled={busyFriendAction}
                  onClick={() => void handleRemoveOrReject()}
                >
                  {dict.social.rejectAction}
                </HairlineButton>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="border border-acid bg-acid px-2.5 py-1.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-acid-ink">
                  {dict.social.friendsBadge}
                </span>
                {confirmUnfriend ? (
                  <>
                    <HairlineButton
                      size="sm"
                      variant="inverted"
                      disabled={busyFriendAction}
                      onClick={() => void handleRemoveOrReject()}
                    >
                      {dict.social.removeFriendAction}
                    </HairlineButton>
                    <HairlineButton
                      size="sm"
                      disabled={busyFriendAction}
                      onClick={() => setConfirmUnfriend(false)}
                    >
                      {dict.common.close}
                    </HairlineButton>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={dict.social.removeFriendAction}
                    onClick={() => setConfirmUnfriend(true)}
                    className="cursor-pointer border border-line px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Inline Self Profile Editor */}
        {isSelf && editing ? (
          <form
            onSubmit={(event) => void handleSaveProfile(event)}
            className="mt-6 flex flex-col gap-4 border border-line bg-surface p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <div className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
                  {dict.profile.avatarLabel}
                </div>
                <p className="mt-0.5 font-mono text-[0.66rem] text-ink-muted">
                  {dict.profile.avatarHint}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void handleAvatarChange(event)}
                  className="hidden"
                />
                <HairlineButton
                  size="sm"
                  variant="acid"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingAvatar ? dict.profile.uploadingAvatar : dict.profile.uploadAvatarButton}
                </HairlineButton>
                {profile.user.avatarPath ? (
                  <HairlineButton
                    size="sm"
                    disabled={uploadingAvatar}
                    onClick={() => void handleRemoveAvatar()}
                  >
                    {dict.profile.removeAvatarButton}
                  </HairlineButton>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-display-name`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.profile.displayNameLabel}
                </label>
                <input
                  id={`${formId}-display-name`}
                  type="text"
                  maxLength={50}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={dict.profile.displayNamePlaceholder}
                  className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-location`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.profile.locationLabel}
                </label>
                <input
                  id={`${formId}-location`}
                  type="text"
                  maxLength={80}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder={dict.profile.locationPlaceholder}
                  className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-bio`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.profile.bioLabel}
              </label>
              <textarea
                id={`${formId}-bio`}
                rows={3}
                maxLength={240}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder={dict.profile.bioPlaceholder}
                className="resize-y border border-line bg-bg p-3 font-serif text-[1.1rem] text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <HairlineButton type="submit" variant="acid" size="sm" disabled={savingProfile}>
                {savingProfile ? dict.common.saving : dict.profile.saveProfileButton}
              </HairlineButton>
            </div>
          </form>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 border border-line-strong bg-surface px-3.5 py-2 font-mono text-xs text-ink"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="mt-4 border border-acid bg-surface px-3.5 py-2 font-mono text-xs text-ink"
          >
            {notice}
          </p>
        ) : null}
      </section>

      {/* Shared Festivals Highlight Band */}
      {profile.sharedFestivals.length > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
            {dict.profile.sharedFestivalsLabel(profile.sharedFestivals.length)}
          </span>
          <div className="flex flex-wrap gap-2">
            {profile.sharedFestivals.map((fest) => (
              <Link
                key={fest.id}
                href={`/lineup?festival=${encodeURIComponent(fest.slug)}`}
                className="border border-acid bg-acid px-2.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-acid-ink"
              >
                {fest.name} {fest.year}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Single-line Tab Bar */}
      <div
        role="tablist"
        aria-label={profile.user.username}
        className="grid h-[48px] grid-cols-2 border-b border-line"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "posts"}
          onClick={() => setTab("posts")}
          className={`cursor-pointer border-r border-line px-4 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            tab === "posts"
              ? "bg-ink font-semibold text-bg"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.profile.tabPosts(profile.posts.length)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "festivals"}
          onClick={() => setTab("festivals")}
          className={`cursor-pointer px-4 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            tab === "festivals"
              ? "bg-ink font-semibold text-bg"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.profile.tabFestivals(profile.festivals.length)}
        </button>
      </div>

      {/* Tab Content */}
      {tab === "posts" ? (
        !profile.canViewActivity ? (
          <EmptyState
            title={dict.profile.privateContentTitle}
            description={
              profile.relationship === "FRIENDS"
                ? dict.profile.privateContentSelfOnly
                : dict.profile.privateContentFriendsOnly
            }
          />
        ) : profile.posts.length === 0 ? (
          <EmptyState
            title={dict.social.emptyFeedTitle}
            description={isSelf ? dict.profile.emptyPostsSelf : dict.profile.emptyPostsFriend}
          />
        ) : (
          <SocialPostList posts={profile.posts} showAuthor={false} />
        )
      ) : !profile.canViewFestivals ? (
        <EmptyState
          title={dict.profile.privateContentTitle}
          description={
            profile.relationship === "FRIENDS"
              ? dict.profile.privateContentSelfOnly
              : dict.profile.privateContentFriendsOnly
          }
        />
      ) : profile.festivals.length === 0 ? (
        <EmptyState
          title={dict.festivals.emptyTitle}
          description={dict.profile.emptyFestivalsFriend}
        />
      ) : (
        <ul>
          {profile.festivals.map((fest, idx) => (
            <li
              key={fest.id}
              className="border-b border-line transition-colors hover:bg-surface last:border-b-0"
            >
              <Link
                href={`/lineup?festival=${encodeURIComponent(fest.slug)}`}
                className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
                    {String(idx + 1).padStart(2, "0")} · {fest.year}
                  </div>
                  <div className="mt-0.5 font-display text-[1.22rem] font-extrabold uppercase tracking-[-0.02em] text-ink">
                    {fest.name} {fest.year}
                  </div>
                  {fest.location ? (
                    <p className="mt-0.5 font-serif text-[1rem] italic text-ink-muted">
                      {fest.location}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink-muted">
                  {dict.workspace.artistsBadgeShort(fest.entriesCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
