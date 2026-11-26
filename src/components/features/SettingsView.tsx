"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { changePasswordAction, logoutAction } from "@/actions/auth-actions";
import type { AuthUserDTO } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/context";

type ThemePreference = "system" | "dark" | "light";

interface SettingsViewProps {
  currentUser: AuthUserDTO;
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem("kue-theme");
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return "system";
}

function syncThemeColorMetas(pref: ThemePreference) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    return;
  }
  for (const meta of metas) {
    const media = meta.getAttribute("media") ?? "";
    if (pref === "dark") {
      meta.setAttribute("content", "#000000");
    } else if (pref === "light") {
      meta.setAttribute("content", "#f4f4ef");
    } else if (media.includes("light")) {
      meta.setAttribute("content", "#f4f4ef");
    } else {
      meta.setAttribute("content", "#000000");
    }
  }
}

function applyThemePreference(next: ThemePreference) {
  const metaContent = next === "system" ? "light dark" : next;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", metaContent);
  }
  syncThemeColorMetas(next);
  try {
    if (next === "system") {
      localStorage.removeItem("kue-theme");
    } else {
      localStorage.setItem("kue-theme", next);
    }
    window.dispatchEvent(new Event("kue-theme-change"));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function SettingsView({ currentUser }: SettingsViewProps) {
  const { locale, dict, setLocale } = useI18n();
  const router = useRouter();
  const formId = useId();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<"dark" | "light">("dark");
  const [savingLocale, setSavingLocale] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncTheme = () => {
      const pref = readStoredTheme();
      setTheme(pref);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute("content", pref === "system" ? "light dark" : pref);
      }
      syncThemeColorMetas(pref);
    };
    syncTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemScheme = () => {
      setSystemScheme(mediaQuery.matches ? "dark" : "light");
    };
    syncSystemScheme();

    const onStorage = (event: StorageEvent) => {
      if (event.key === "kue-theme" || event.key === null) {
        syncTheme();
      }
    };

    mediaQuery.addEventListener("change", syncSystemScheme);
    window.addEventListener("kue-theme-change", syncTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      mediaQuery.removeEventListener("change", syncSystemScheme);
      window.removeEventListener("kue-theme-change", syncTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleLocaleSelect = async (next: Locale) => {
    if (next === locale || savingLocale) {
      return;
    }
    setSavingLocale(true);
    setSavedNotice(false);
    try {
      await setLocale(next);
      setSavedNotice(true);
    } finally {
      setSavingLocale(false);
    }
  };

  const handleThemeSelect = (next: ThemePreference) => {
    setTheme(next);
    applyThemePreference(next);
    setSavedNotice(true);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
      }
      try {
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const key = localStorage.key(i);
          if (key?.startsWith("kue-festival-mode:")) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // Ignore storage errors in restricted contexts
      }
      await logoutAction();
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordError(dict.auth.passwordMismatch);
      return;
    }

    setSavingPassword(true);
    try {
      const res = await changePasswordAction({ currentPassword, newPassword });
      if (!res.ok) {
        setPasswordError(res.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowPasswordForm(false);
      setPasswordNotice(dict.account.passwordUpdated);
    } finally {
      setSavingPassword(false);
    }
  };

  const languageOptions: Array<{ value: Locale; label: string; meta: string }> = [
    {
      value: "gl",
      label: dict.settings.languageGlLabel,
      meta: dict.settings.languageGlMeta,
    },
    {
      value: "pt-PT",
      label: dict.settings.languagePtLabel,
      meta: dict.settings.languagePtMeta,
    },
    {
      value: "es-ES",
      label: dict.settings.languageEsLabel,
      meta: dict.settings.languageEsMeta,
    },
  ];

  const themeOptions: Array<{ value: ThemePreference; label: string; meta: string }> = [
    {
      value: "system",
      label: dict.settings.themeSystemLabel,
      meta: dict.settings.themeSystemMeta(systemScheme),
    },
    {
      value: "dark",
      label: dict.settings.themeDarkLabel,
      meta: dict.settings.themeDarkMeta,
    },
    {
      value: "light",
      label: dict.settings.themeLightLabel,
      meta: dict.settings.themeLightMeta,
    },
  ];

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-7 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8">
      <div className="border-b border-line pb-6">
        <h1 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
          {dict.settings.title}
        </h1>
        <p className="mt-2 font-serif text-[1.25rem] italic text-ink-muted">
          {dict.settings.subtitle}
        </p>
      </div>

      {/* Account & Security Section */}
      <section aria-labelledby="settings-account-heading" className="flex flex-col gap-4">
        <div>
          <h2
            id="settings-account-heading"
            className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink"
          >
            {dict.account.sectionTitle}
          </h2>
          <p className="mt-1 font-serif text-[1.08rem] text-ink-muted">
            {dict.account.sectionDescription}
          </p>
        </div>

        <div className="border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-extrabold tracking-[-0.02em] text-ink">
                  @{currentUser.username}
                </span>
                <span
                  className={
                    currentUser.role === "ADMIN"
                      ? "bg-acid px-1.5 py-0.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                      : "border border-line px-1.5 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-ink-muted"
                  }
                >
                  {currentUser.role === "ADMIN" ? dict.account.roleAdmin : dict.account.roleUser}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-ink-muted">{currentUser.email}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentUser.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className="inline-flex border border-acid bg-acid px-3.5 py-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                >
                  {dict.account.openAdminDashboard}
                </Link>
              ) : null}
              <HairlineButton
                size="sm"
                onClick={() => {
                  setPasswordError(null);
                  setPasswordNotice(null);
                  setShowPasswordForm((prev) => !prev);
                }}
              >
                {showPasswordForm ? dict.common.close : dict.account.changePasswordTitle}
              </HairlineButton>
              <HairlineButton size="sm" disabled={loggingOut} onClick={() => void handleLogout()}>
                {loggingOut ? dict.account.loggingOut : dict.account.logoutAction}
              </HairlineButton>
            </div>
          </div>

          {showPasswordForm ? (
            <form
              onSubmit={(event) => void handlePasswordChange(event)}
              className="flex flex-col gap-3 border-t border-line bg-bg p-4 sm:p-5"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${formId}-curr-pw`}
                    className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.account.currentPasswordLabel}
                  </label>
                  <input
                    id={`${formId}-curr-pw`}
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${formId}-new-pw`}
                    className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.account.newPasswordLabel}
                  </label>
                  <input
                    id={`${formId}-new-pw`}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${formId}-conf-pw`}
                    className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.account.confirmNewPasswordLabel}
                  </label>
                  <input
                    id={`${formId}-conf-pw`}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    className="border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                  />
                </div>
              </div>

              {passwordError ? (
                <p
                  role="alert"
                  className="border border-line-strong bg-surface px-3 py-2 font-mono text-xs text-ink"
                >
                  {passwordError}
                </p>
              ) : null}

              <div className="flex justify-end">
                <HairlineButton type="submit" variant="acid" size="sm" disabled={savingPassword}>
                  {savingPassword ? dict.common.saving : dict.account.changePasswordSubmit}
                </HairlineButton>
              </div>
            </form>
          ) : null}
        </div>

        {passwordNotice ? (
          <p
            role="status"
            className="border border-acid bg-surface px-4 py-2.5 font-mono text-xs text-ink"
          >
            {passwordNotice}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="settings-language-heading"
        className="flex flex-col gap-4 border-t border-line pt-8"
      >
        <div>
          <h2
            id="settings-language-heading"
            className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink"
          >
            {dict.settings.languageSectionTitle}
          </h2>
          <p className="mt-1 font-serif text-[1.08rem] text-ink-muted">
            {dict.settings.languageDescription}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {languageOptions.map((option) => {
            const isActive = locale === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                disabled={savingLocale}
                onClick={() => void handleLocaleSelect(option.value)}
                className={`flex cursor-pointer items-center justify-between gap-4 border p-4 text-left transition-colors disabled:opacity-60 ${
                  isActive
                    ? "border-acid bg-acid text-acid-ink"
                    : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                <div>
                  <div className="font-display text-lg font-extrabold leading-tight">
                    {option.label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                      isActive ? "text-acid-ink/80" : "text-ink-muted"
                    }`}
                  >
                    {option.meta}
                  </div>
                </div>
                {isActive ? (
                  <span className="shrink-0 border border-acid-ink px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em]">
                    {dict.settings.activeBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="settings-theme-heading"
        className="flex flex-col gap-4 border-t border-line pt-8"
      >
        <div>
          <h2
            id="settings-theme-heading"
            className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink"
          >
            {dict.settings.themeSectionTitle}
          </h2>
          <p className="mt-1 font-serif text-[1.08rem] text-ink-muted">
            {dict.settings.themeDescription}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const isActive = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleThemeSelect(option.value)}
                className={`flex cursor-pointer items-center justify-between gap-3 border p-4 text-left transition-colors ${
                  isActive
                    ? "border-acid bg-acid text-acid-ink"
                    : "border-line bg-surface text-ink hover:border-ink"
                }`}
              >
                <div>
                  <div className="font-display text-lg font-extrabold leading-tight">
                    {option.label}
                  </div>
                  <div
                    className={`mt-1 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                      isActive ? "text-acid-ink/80" : "text-ink-muted"
                    }`}
                  >
                    {option.meta}
                  </div>
                </div>
                {isActive ? (
                  <span className="shrink-0 border border-acid-ink px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em]">
                    {dict.settings.activeBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {savedNotice ? (
        <p
          role="status"
          className="border border-line bg-surface px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ink-muted"
        >
          {dict.settings.savedNotice}
        </p>
      ) : null}
    </main>
  );
}
