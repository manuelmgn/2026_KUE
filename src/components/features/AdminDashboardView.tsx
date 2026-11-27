"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  adminCreateInvitationAction,
  adminCreateUserAction,
  adminDeleteEditionAction,
  adminDeleteFestivalAction,
  adminDeleteUserAction,
  adminResetPasswordAction,
  adminRevokeInvitationAction,
  adminSetUserActiveAction,
  adminSetUserRoleAction,
} from "@/actions/admin-actions";
import type { CatalogFestivalDTO } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import {
  INVITATION_DEFAULT_DURATION,
  INVITATION_DEFAULT_MAX_USES,
  INVITATION_DURATIONS,
  INVITATION_MAX_USES,
  INVITATION_MIN_USES,
  type InvitationDuration,
  type UserRole,
} from "@/domain/schemas";
import { useI18n } from "@/i18n/context";
import type { InvitationLinkDTO, InvitationStatus } from "@/server/services/invitations";
import type { AdminDashboardStatsDTO, AdminUserRowDTO } from "@/server/services/users";

interface AdminDashboardViewProps {
  currentUserId: string;
  initialStats: AdminDashboardStatsDTO;
  initialUsers: AdminUserRowDTO[];
  initialInvitations: InvitationLinkDTO[];
  initialCatalog: CatalogFestivalDTO[];
}

const INVITATION_USES_OPTIONS = Array.from(
  { length: INVITATION_MAX_USES - INVITATION_MIN_USES + 1 },
  (_, index) => INVITATION_MIN_USES + index,
);

export function AdminDashboardView({
  currentUserId,
  initialStats,
  initialUsers,
  initialInvitations,
  initialCatalog,
}: AdminDashboardViewProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const formId = useId();

  const [activeTab, setActiveTab] = useState<"users" | "invitations" | "catalog">("users");
  const [stats, setStats] = useState(initialStats);
  const [users, setUsers] = useState(initialUsers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [userQuery, setUserQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("USER");

  // Create invitation form
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(INVITATION_DEFAULT_MAX_USES);
  const [inviteDuration, setInviteDuration] = useState<InvitationDuration>(
    INVITATION_DEFAULT_DURATION,
  );
  const [latestCreatedInvite, setLatestCreatedInvite] = useState<InvitationLinkDTO | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Reset password inline row
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordDraft, setResetPasswordDraft] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return dict.admin.neverLoggedIn;
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  };

  const buildInviteUrl = (token: string) => {
    const path = `/register?invite=${encodeURIComponent(token)}`;
    return origin ? `${origin}${path}` : path;
  };

  const getDurationLabel = (duration: InvitationDuration) => {
    switch (duration) {
      case "5h":
        return dict.admin.invitationDuration5h;
      case "24h":
        return dict.admin.invitationDuration24h;
      case "72h":
        return dict.admin.invitationDuration72h;
      case "7d":
        return dict.admin.invitationDuration7d;
      case "30d":
        return dict.admin.invitationDuration30d;
    }
  };

  const getInvitationStatusLabel = (status: InvitationStatus) => {
    switch (status) {
      case "ACTIVE":
        return dict.admin.invitationStatusActive;
      case "EXHAUSTED":
        return dict.admin.invitationStatusExhausted;
      case "EXPIRED":
        return dict.admin.invitationStatusExpired;
      case "REVOKED":
        return dict.admin.invitationStatusRevoked;
    }
  };

  const handleCopyInvite = async (invite: InvitationLinkDTO) => {
    const path = `/register?invite=${encodeURIComponent(invite.token)}`;
    const fullUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${path}`
        : buildInviteUrl(invite.token);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fullUrl);
      } catch {
        // Ignore clipboard errors in restricted environments
      }
    }
    setCopiedInviteId(invite.id);
    window.setTimeout(() => {
      setCopiedInviteId((prev) => (prev === invite.id ? null : prev));
    }, 2000);
  };

  const handleCreateInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusyKey("create-invite");
    try {
      const res = await adminCreateInvitationAction({
        maxUses: inviteMaxUses,
        duration: inviteDuration,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInvitations((prev) => [res.data, ...prev]);
      setLatestCreatedInvite(res.data);
      setStats((prev) => ({
        ...prev,
        activeInvitations: prev.activeInvitations + 1,
      }));
      setNotice(dict.admin.invitationCreated);
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleRevokeInvitation = async (invite: InvitationLinkDTO) => {
    setError(null);
    setNotice(null);
    setBusyKey(`revoke-invite-${invite.id}`);
    try {
      const res = await adminRevokeInvitationAction({ invitationId: invite.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInvitations((prev) => prev.map((item) => (item.id === invite.id ? res.data : item)));
      if (latestCreatedInvite?.id === invite.id) {
        setLatestCreatedInvite(null);
      }
      if (invite.status === "ACTIVE") {
        setStats((prev) => ({
          ...prev,
          activeInvitations: Math.max(0, prev.activeInvitations - 1),
        }));
      }
      setNotice(dict.admin.invitationRevoked);
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusyKey("create-user");
    try {
      const res = await adminCreateUserAction({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: newRole,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const created: AdminUserRowDTO = {
        ...res.data,
        editionsCount: 0,
        ratedArtistsCount: 0,
        activeSessionsCount: 0,
      };
      setUsers((prev) => [...prev, created]);
      setStats((prev) => ({
        ...prev,
        totalUsers: prev.totalUsers + 1,
        activeUsers: prev.activeUsers + 1,
        adminUsers: prev.adminUsers + (created.role === "ADMIN" ? 1 : 0),
      }));
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("USER");
      setShowCreateUser(false);
      setNotice(dict.admin.userCreated);
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: UserRole) => {
    setError(null);
    setNotice(null);
    setBusyKey(`role-${userId}`);
    try {
      const res = await adminSetUserRoleAction({ userId, role: nextRole });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: res.data.role } : u)));
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleActiveToggle = async (userId: string, nextActive: boolean) => {
    setError(null);
    setNotice(null);
    setBusyKey(`active-${userId}`);
    try {
      const res = await adminSetUserActiveAction({ userId, isActive: nextActive });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                isActive: res.data.isActive,
                activeSessionsCount: res.data.isActive ? u.activeSessionsCount : 0,
              }
            : u,
        ),
      );
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setError(null);
    setNotice(null);
    setBusyKey(`reset-${userId}`);
    try {
      const res = await adminResetPasswordAction({ userId, newPassword: resetPasswordDraft });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResetTargetId(null);
      setResetPasswordDraft("");
      setNotice(dict.admin.passwordResetSuccess);
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteUser = async (user: AdminUserRowDTO) => {
    if (!window.confirm(dict.admin.deleteUserConfirm(user.username))) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusyKey(`del-${user.id}`);
    try {
      const res = await adminDeleteUserAction({ userId: user.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setStats((prev) => ({
        ...prev,
        totalUsers: Math.max(0, prev.totalUsers - 1),
        activeUsers: user.isActive ? Math.max(0, prev.activeUsers - 1) : prev.activeUsers,
      }));
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteEdition = async (
    festivalId: string,
    festivalName: string,
    editionId: string,
    year: number,
  ) => {
    if (!window.confirm(dict.admin.deleteEditionConfirm(festivalName, year))) {
      return;
    }
    setError(null);
    setBusyKey(`del-ed-${editionId}`);
    try {
      const res = await adminDeleteEditionAction(editionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCatalog((prev) =>
        prev
          .map((f) =>
            f.id === festivalId
              ? { ...f, editions: f.editions.filter((ed) => ed.id !== editionId) }
              : f,
          )
          .filter((f) => f.editions.length > 0),
      );
      setStats((prev) => ({ ...prev, totalEditions: Math.max(0, prev.totalEditions - 1) }));
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteFestival = async (festival: CatalogFestivalDTO) => {
    if (!window.confirm(dict.admin.deleteFestivalConfirm(festival.name))) {
      return;
    }
    setError(null);
    setBusyKey(`del-fest-${festival.id}`);
    try {
      const res = await adminDeleteFestivalAction(festival.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCatalog((prev) => prev.filter((f) => f.id !== festival.id));
      setStats((prev) => ({
        ...prev,
        totalFestivals: Math.max(0, prev.totalFestivals - 1),
        totalEditions: Math.max(0, prev.totalEditions - festival.editions.length),
      }));
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const filteredUsers = userQuery.trim()
    ? users.filter((u) => {
        const needle = userQuery.trim().toLowerCase();
        return u.username.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle);
      })
    : users;

  return (
    <main className="w-full">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
        <div>
          <h1
            data-page-heading
            className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
          >
            {dict.admin.title}
          </h1>
          <p className="mt-2 font-serif text-[1.15rem] italic text-ink-muted">
            {dict.admin.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HairlineButton
            variant={activeTab === "invitations" ? "default" : "acid"}
            size="md"
            onClick={() => {
              setError(null);
              setNotice(null);
              setActiveTab("invitations");
            }}
          >
            {dict.admin.newInvitationButton}
          </HairlineButton>

          <HairlineButton
            variant={showCreateUser ? "inverted" : "default"}
            size="md"
            onClick={() => {
              setError(null);
              setShowCreateUser((prev) => !prev);
            }}
          >
            {showCreateUser ? dict.common.close : dict.admin.newUserButton}
          </HairlineButton>
        </div>
      </div>

      {/* Structural 1px metrics strip */}
      <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
        {[
          { label: dict.admin.statUsers, value: `${stats.activeUsers}/${stats.totalUsers}` },
          { label: dict.admin.statActiveSessions, value: String(stats.activeSessions) },
          { label: dict.admin.statFestivals, value: String(stats.totalFestivals) },
          { label: dict.admin.statEditions, value: String(stats.totalEditions) },
        ].map((item, idx) => (
          <div
            key={item.label}
            className={`px-5 py-4 sm:px-6 ${idx % 2 === 0 ? "border-r border-line" : ""} ${
              idx < 2 ? "border-b border-line sm:border-b-0" : ""
            } ${idx < 3 ? "sm:border-r sm:border-line" : ""}`}
          >
            <div className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
              {item.label}
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold tracking-[-0.02em] text-ink">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Inline Create User form */}
      {showCreateUser ? (
        <form
          onSubmit={(event) => void handleCreateUser(event)}
          className="border-b border-line-strong bg-surface px-5 py-5 sm:px-6"
        >
          <h2 className="font-mono text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-ink">
            {dict.admin.createUserTitle}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-username`}
                className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.auth.usernameLabel}
              </label>
              <input
                id={`${formId}-username`}
                type="text"
                required
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder={dict.auth.usernamePlaceholder}
                className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-email`}
                className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.auth.emailLabel}
              </label>
              <input
                id={`${formId}-email`}
                type="email"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder={dict.auth.emailPlaceholder}
                className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-password`}
                className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.auth.passwordLabel}
              </label>
              <input
                id={`${formId}-password`}
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={dict.auth.passwordPlaceholder}
                className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-role`}
                className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.admin.roleLabel}
              </label>
              <select
                id={`${formId}-role`}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as UserRole)}
                className="border border-line bg-bg px-3 py-2 font-mono text-xs uppercase text-ink focus:border-acid focus:outline-none"
              >
                <option value="USER">{dict.account.roleUser}</option>
                <option value="ADMIN">{dict.account.roleAdmin}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <HairlineButton
              type="submit"
              variant="acid"
              size="md"
              disabled={busyKey === "create-user"}
            >
              {dict.admin.createUserSubmit}
            </HairlineButton>
          </div>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-b border-line-strong bg-surface px-5 py-3 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="border-b border-acid bg-surface px-5 py-3 font-mono text-xs text-ink sm:px-6"
        >
          {notice}
        </p>
      ) : null}

      {/* Tabs: Users | Invitations | Catalog */}
      <div role="tablist" className="grid grid-cols-3 border-b border-line">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          className={`cursor-pointer border-r border-line px-4 py-3 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            activeTab === "users"
              ? "bg-acid font-semibold text-acid-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.admin.tabUsers(users.length)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "invitations"}
          onClick={() => setActiveTab("invitations")}
          className={`cursor-pointer border-r border-line px-4 py-3 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            activeTab === "invitations"
              ? "bg-acid font-semibold text-acid-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.admin.tabInvitations(invitations.length)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "catalog"}
          onClick={() => setActiveTab("catalog")}
          className={`cursor-pointer px-4 py-3 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            activeTab === "catalog"
              ? "bg-acid font-semibold text-acid-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {dict.admin.tabCatalog(catalog.length)}
        </button>
      </div>

      {/* TAB 1: Users */}
      {activeTab === "users" ? (
        <section>
          <div className="border-b border-line px-5 py-3 sm:px-6">
            <input
              type="search"
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder={dict.admin.filterUsersPlaceholder}
              className="w-full bg-transparent font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </div>

          <ul>
            {filteredUsers.map((user, idx) => {
              const isSelf = user.id === currentUserId;
              const isResetOpen = resetTargetId === user.id;
              return (
                <li key={user.id} className="border-b border-line">
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.06em]">
                        <span className="text-ink-muted">{String(idx + 1).padStart(2, "0")}</span>
                        <span
                          className={
                            user.role === "ADMIN"
                              ? "bg-acid px-1.5 py-0.5 font-semibold text-acid-ink"
                              : "border border-line px-1.5 py-0.5 text-ink-muted"
                          }
                        >
                          {user.role}
                        </span>
                        <span
                          className={
                            user.isActive
                              ? "border border-line px-1.5 py-0.5 text-ink"
                              : "border border-line-strong bg-surface px-1.5 py-0.5 text-ink-muted line-through"
                          }
                        >
                          {user.isActive ? dict.admin.statusActive : dict.admin.statusSuspended}
                        </span>
                        {isSelf ? (
                          <span className="border border-ink px-1.5 py-0.5 text-ink">
                            {dict.admin.youBadge}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="font-display text-lg font-extrabold tracking-[-0.02em] text-ink">
                          @{user.username}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">{user.email}</span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.66rem] uppercase tracking-[0.05em] text-ink-muted">
                        <span>{dict.admin.editionsStat(user.editionsCount)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dict.admin.ratedStat(user.ratedArtistsCount)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {dict.admin.lastLoginLabel}: {formatDate(user.lastLoginAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {!isSelf ? (
                        <>
                          <HairlineButton
                            size="sm"
                            disabled={busyKey === `role-${user.id}`}
                            onClick={() =>
                              void handleRoleChange(
                                user.id,
                                user.role === "ADMIN" ? "USER" : "ADMIN",
                              )
                            }
                          >
                            {user.role === "ADMIN" ? dict.admin.makeUser : dict.admin.makeAdmin}
                          </HairlineButton>

                          <HairlineButton
                            size="sm"
                            disabled={busyKey === `active-${user.id}`}
                            onClick={() => void handleActiveToggle(user.id, !user.isActive)}
                          >
                            {user.isActive ? dict.admin.suspendUser : dict.admin.activateUser}
                          </HairlineButton>
                        </>
                      ) : null}

                      <HairlineButton
                        size="sm"
                        variant={isResetOpen ? "inverted" : "default"}
                        onClick={() => {
                          setResetTargetId(isResetOpen ? null : user.id);
                          setResetPasswordDraft("");
                        }}
                      >
                        {dict.admin.resetPassword}
                      </HairlineButton>

                      {!isSelf ? (
                        <HairlineButton
                          size="sm"
                          disabled={busyKey === `del-${user.id}`}
                          onClick={() => void handleDeleteUser(user)}
                        >
                          {dict.admin.deleteUser}
                        </HairlineButton>
                      ) : null}
                    </div>
                  </div>

                  {isResetOpen ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3 sm:px-6">
                      <input
                        type="password"
                        minLength={8}
                        value={resetPasswordDraft}
                        onChange={(event) => setResetPasswordDraft(event.target.value)}
                        placeholder={dict.admin.resetPasswordPrompt(user.username)}
                        className="min-w-[220px] flex-1 border border-line bg-bg px-3 py-1.5 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                      />
                      <HairlineButton
                        variant="acid"
                        size="sm"
                        disabled={resetPasswordDraft.length < 8 || busyKey === `reset-${user.id}`}
                        onClick={() => void handleResetPassword(user.id)}
                      >
                        {dict.admin.resetPasswordSubmit}
                      </HairlineButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* TAB 2: Invitation Links */}
      {activeTab === "invitations" ? (
        <section>
          <form
            onSubmit={(event) => void handleCreateInvitation(event)}
            className="border-b border-line bg-surface px-5 py-5 sm:px-6"
          >
            <h2 className="font-mono text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-ink">
              {dict.admin.invitationsTitle}
            </h2>
            <p className="mt-1 font-serif text-[1.02rem] italic text-ink-muted">
              {dict.admin.invitationsDescription}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-invite-uses`}
                  className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.admin.invitationMaxUsesLabel}
                </label>
                <select
                  id={`${formId}-invite-uses`}
                  value={String(inviteMaxUses)}
                  onChange={(event) => setInviteMaxUses(Number(event.target.value))}
                  className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                >
                  {INVITATION_USES_OPTIONS.map((count) => (
                    <option key={count} value={String(count)}>
                      {dict.admin.invitationUseOption(count)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-invite-duration`}
                  className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.admin.invitationDurationLabel}
                </label>
                <select
                  id={`${formId}-invite-duration`}
                  value={inviteDuration}
                  onChange={(event) => setInviteDuration(event.target.value as InvitationDuration)}
                  className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                >
                  {INVITATION_DURATIONS.map((duration) => (
                    <option key={duration} value={duration}>
                      {getDurationLabel(duration)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end sm:justify-start">
                <HairlineButton
                  type="submit"
                  variant="acid"
                  size="md"
                  disabled={busyKey === "create-invite"}
                >
                  {busyKey === "create-invite"
                    ? dict.admin.creatingInvitation
                    : dict.admin.createInvitationSubmit}
                </HairlineButton>
              </div>
            </div>

            {latestCreatedInvite && latestCreatedInvite.status === "ACTIVE" ? (
              <div
                data-latest-invite-box
                className="mt-4 flex flex-col gap-2 border border-acid bg-bg p-3 sm:flex-row sm:items-center"
              >
                <input
                  type="text"
                  readOnly
                  aria-label={dict.admin.invitationsTitle}
                  value={buildInviteUrl(latestCreatedInvite.token)}
                  onClick={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink focus:outline-none"
                />
                <HairlineButton
                  size="sm"
                  variant="acid"
                  onClick={() => void handleCopyInvite(latestCreatedInvite)}
                >
                  {copiedInviteId === latestCreatedInvite.id
                    ? dict.admin.copiedInviteLink
                    : dict.admin.copyInviteLink}
                </HairlineButton>
              </div>
            ) : null}
          </form>

          {invitations.length === 0 ? (
            <p className="px-5 py-8 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.admin.invitationsEmpty}
            </p>
          ) : (
            <ul>
              {invitations.map((invite, idx) => (
                <li key={invite.id} className="border-b border-line px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.06em]">
                        <span className="text-ink-muted">{String(idx + 1).padStart(2, "0")}</span>
                        <span
                          className={
                            invite.status === "ACTIVE"
                              ? "bg-acid px-1.5 py-0.5 font-semibold text-acid-ink"
                              : "border border-line px-1.5 py-0.5 text-ink-muted"
                          }
                        >
                          {getInvitationStatusLabel(invite.status)}
                        </span>
                        <span className="border border-line px-1.5 py-0.5 text-ink">
                          {dict.admin.invitationUsesStat(invite.usedCount, invite.maxUses)}
                        </span>
                      </div>

                      <div className="mt-1.5 truncate font-mono text-xs text-ink">
                        {buildInviteUrl(invite.token)}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.66rem] uppercase tracking-[0.05em] text-ink-muted">
                        <span>
                          {dict.admin.invitationCreatedLabel}: {formatDate(invite.createdAt)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {dict.admin.invitationExpiresLabel}: {formatDate(invite.expiresAt)}
                        </span>
                        {invite.createdByUsername ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>@{invite.createdByUsername}</span>
                          </>
                        ) : null}
                      </div>

                      {invite.registeredUsernames.length > 0 ? (
                        <div className="mt-1 font-mono text-[0.66rem] text-ink-muted">
                          {dict.admin.invitationUsedByLabel}:{" "}
                          {invite.registeredUsernames.map((name) => `@${name}`).join(", ")}
                        </div>
                      ) : null}
                    </div>

                    {invite.status === "ACTIVE" ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <HairlineButton size="sm" onClick={() => void handleCopyInvite(invite)}>
                          {copiedInviteId === invite.id
                            ? dict.admin.copiedInviteLink
                            : dict.admin.copyInviteLink}
                        </HairlineButton>
                        <HairlineButton
                          size="sm"
                          disabled={busyKey === `revoke-invite-${invite.id}`}
                          onClick={() => void handleRevokeInvitation(invite)}
                        >
                          {dict.admin.revokeInvitation}
                        </HairlineButton>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* TAB 3: Global Catalog Moderation */}
      {activeTab === "catalog" ? (
        <section>
          {catalog.length === 0 ? (
            <p className="px-5 py-8 font-serif text-[1.05rem] italic text-ink-muted sm:px-6">
              {dict.admin.catalogEmpty}
            </p>
          ) : (
            <ul>
              {catalog.map((festival) => (
                <li key={festival.id} className="border-b border-line px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-extrabold uppercase tracking-[-0.02em] text-ink">
                        {festival.name}
                      </div>
                      {festival.location ? (
                        <div className="font-serif text-base italic text-ink-muted">
                          {festival.location}
                        </div>
                      ) : null}
                    </div>
                    <HairlineButton
                      size="sm"
                      disabled={busyKey === `del-fest-${festival.id}`}
                      onClick={() => void handleDeleteFestival(festival)}
                    >
                      {dict.admin.deleteFestival}
                    </HairlineButton>
                  </div>

                  <div className="mt-3 flex flex-col border-t border-line">
                    {festival.editions.map((ed) => (
                      <div
                        key={ed.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-b-0"
                      >
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                          <span className="font-semibold text-ink">{ed.year}</span>
                          <span className="text-ink-muted">·</span>
                          <span className="text-ink-muted">
                            {dict.workspace.artistsBadgeShort(ed.entriesCount)}
                          </span>
                          <span className="text-ink-muted">·</span>
                          <span className="text-ink-muted">
                            {dict.admin.followersCount(ed.followersCount)}
                          </span>
                        </div>
                        <HairlineButton
                          size="sm"
                          disabled={busyKey === `del-ed-${ed.id}`}
                          onClick={() =>
                            void handleDeleteEdition(festival.id, festival.name, ed.id, ed.year)
                          }
                        >
                          {dict.admin.deleteEdition}
                        </HairlineButton>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
