"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  adminCreateUserAction,
  adminDeleteEditionAction,
  adminDeleteFestivalAction,
  adminDeleteUserAction,
  adminResetPasswordAction,
  adminSetUserActiveAction,
  adminSetUserRoleAction,
  toggleRegistrationOpenAction,
} from "@/actions/admin-actions";
import type { CatalogFestivalDTO } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import type { UserRole } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";
import type { AdminDashboardStatsDTO, AdminUserRowDTO } from "@/server/services/users";

interface AdminDashboardViewProps {
  currentUserId: string;
  initialStats: AdminDashboardStatsDTO;
  initialUsers: AdminUserRowDTO[];
  initialCatalog: CatalogFestivalDTO[];
}

export function AdminDashboardView({
  currentUserId,
  initialStats,
  initialUsers,
  initialCatalog,
}: AdminDashboardViewProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const formId = useId();

  const [activeTab, setActiveTab] = useState<"users" | "catalog">("users");
  const [stats, setStats] = useState(initialStats);
  const [users, setUsers] = useState(initialUsers);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [userQuery, setUserQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("USER");

  // Reset password inline row
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordDraft, setResetPasswordDraft] = useState("");

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

  const handleToggleRegistration = async () => {
    setError(null);
    setNotice(null);
    setBusyKey("reg");
    try {
      const res = await toggleRegistrationOpenAction(!stats.registrationOpen);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStats((prev) => ({ ...prev, registrationOpen: res.data.registrationOpen }));
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
          <button
            type="button"
            disabled={busyKey === "reg"}
            onClick={() => void handleToggleRegistration()}
            className="flex cursor-pointer items-center gap-2 border border-line bg-surface px-3 py-2 font-mono text-[0.72rem] uppercase tracking-[0.06em] transition-colors hover:border-ink disabled:opacity-50"
          >
            <span className="text-ink-muted">{dict.admin.registrationLabel}:</span>
            <span
              className={
                stats.registrationOpen
                  ? "bg-acid px-1.5 py-0.5 font-semibold text-acid-ink"
                  : "border border-line px-1.5 py-0.5 text-ink"
              }
            >
              {stats.registrationOpen ? dict.admin.registrationOpen : dict.admin.registrationClosed}
            </span>
          </button>

          <HairlineButton
            variant={showCreateUser ? "default" : "acid"}
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

      {/* Tabs: Users | Catalog */}
      <div role="tablist" className="grid grid-cols-2 border-b border-line">
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

      {/* TAB 2: Global Catalog Moderation */}
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
