"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { loginAction, registerAction } from "@/actions/auth-actions";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { KueLogo } from "@/components/ui/KueLogo";
import { useI18n } from "@/i18n/context";
import type { InviteValidationResult } from "@/server/services/invitations";

interface AuthFormProps {
  mode: "login" | "register";
  isFirstUser: boolean;
  inviteToken?: string | null;
  inviteState?: InviteValidationResult | null;
  nextPath?: string | null;
}

export function AuthForm({ mode, isFirstUser, inviteToken, inviteState, nextPath }: AuthFormProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const formId = useId();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeNext = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError(dict.auth.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        const res = await loginAction({ username, password });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(safeNext);
        router.refresh();
      } else {
        const res = await registerAction({
          username,
          email,
          password,
          inviteToken: inviteToken ?? undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(safeNext);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const registrationBlocked =
    mode === "register" && !isFirstUser && inviteState?.status !== "valid";

  const getBlockedCopy = () => {
    switch (inviteState?.status) {
      case "invalid":
        return {
          title: dict.auth.inviteInvalidTitle,
          description: dict.auth.inviteInvalidDescription,
        };
      case "expired":
        return {
          title: dict.auth.inviteExpiredTitle,
          description: dict.auth.inviteExpiredDescription,
        };
      case "exhausted":
        return {
          title: dict.auth.inviteExhaustedTitle,
          description: dict.auth.inviteExhaustedDescription,
        };
      case "revoked":
        return {
          title: dict.auth.inviteRevokedTitle,
          description: dict.auth.inviteRevokedDescription,
        };
      default:
        return {
          title: dict.auth.inviteMissingTitle,
          description: dict.auth.inviteMissingDescription,
        };
    }
  };

  const blockedCopy = registrationBlocked ? getBlockedCopy() : null;
  const formattedInviteExpires =
    inviteState?.status === "valid"
      ? new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(inviteState.expiresAt))
      : null;

  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-clip bg-bg text-ink">
      <header className="kue-top-bar border-b border-line bg-bg">
        <div className="flex h-14 items-stretch justify-between">
          <KueLogo href="/login" />
          <div className="flex items-stretch">
            {mode === "login" && isFirstUser ? (
              <Link
                href="/register"
                className="flex items-center border-l border-line px-4 font-mono text-[0.74rem] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-surface-elevated"
              >
                {dict.auth.goToRegister}
              </Link>
            ) : null}
            {mode === "register" ? (
              <Link
                href="/login"
                className="flex items-center border-l border-line px-4 font-mono text-[0.74rem] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-surface-elevated"
              >
                {dict.auth.goToLogin}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-5 py-10">
        <div className="border border-line bg-surface">
          <div className="border-b border-line px-6 py-6">
            <h1 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
              {mode === "login" ? dict.auth.loginTitle : dict.auth.registerTitle}
            </h1>
            <p className="mt-2 font-serif text-[1.1rem] italic text-ink-muted">
              {mode === "login" ? dict.auth.loginSubtitle : dict.auth.registerSubtitle}
            </p>
          </div>

          {mode === "register" && isFirstUser ? (
            <div className="border-b border-line bg-acid px-6 py-3 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-acid-ink">
              {dict.auth.firstAdminNotice}
            </div>
          ) : null}

          {mode === "register" &&
          !isFirstUser &&
          inviteState?.status === "valid" &&
          formattedInviteExpires ? (
            <div className="border-b border-line bg-acid px-6 py-3 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-acid-ink">
              {dict.auth.inviteValidBanner(
                inviteState.remainingUses,
                inviteState.maxUses,
                formattedInviteExpires,
              )}
            </div>
          ) : null}

          {blockedCopy ? (
            <div className="flex flex-col gap-4 px-6 py-6">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink">
                {blockedCopy.title}
              </p>
              <p className="font-serif text-[1.08rem] text-ink-muted">{blockedCopy.description}</p>
              <Link
                href="/login"
                className="inline-flex justify-center border border-acid bg-acid px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-acid-ink"
              >
                {dict.auth.goToLogin}
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(event) => void handleSubmit(event)}
              className="flex flex-col gap-4 p-6"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${formId}-username`}
                  className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.auth.usernameLabel}
                </label>
                <input
                  id={`${formId}-username`}
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={dict.auth.usernamePlaceholder}
                  className="border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                />
              </div>

              {mode === "register" ? (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${formId}-email`}
                    className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.auth.emailLabel}
                  </label>
                  <input
                    id={`${formId}-email`}
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={dict.auth.emailPlaceholder}
                    className="border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${formId}-password`}
                  className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.auth.passwordLabel}
                </label>
                <input
                  id={`${formId}-password`}
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 8 : 1}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={dict.auth.passwordPlaceholder}
                  className="border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                />
              </div>

              {mode === "register" ? (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${formId}-confirm`}
                    className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.auth.confirmPasswordLabel}
                  </label>
                  <input
                    id={`${formId}-confirm`}
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink focus:border-acid focus:outline-none"
                  />
                </div>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="border border-line-strong bg-bg px-3 py-2.5 font-mono text-xs text-ink"
                >
                  {error}
                </p>
              ) : null}

              <HairlineButton
                type="submit"
                variant="acid"
                size="md"
                disabled={submitting}
                className="mt-2 w-full justify-center py-3"
              >
                {submitting
                  ? mode === "login"
                    ? dict.auth.loggingIn
                    : dict.auth.registering
                  : mode === "login"
                    ? dict.auth.loginSubmit
                    : dict.auth.registerSubmit}
              </HairlineButton>
            </form>
          )}

          {!registrationBlocked ? (
            <div className="flex items-center justify-between border-t border-line bg-bg px-6 py-3.5 font-mono text-[0.72rem] text-ink-muted">
              {mode === "login" ? (
                isFirstUser ? (
                  <>
                    <span>{dict.auth.noAccountPrompt}</span>
                    <Link
                      href="/register"
                      className="uppercase text-ink underline underline-offset-4"
                    >
                      {dict.auth.goToRegister}
                    </Link>
                  </>
                ) : (
                  <span>{dict.auth.inviteOnlyNotice}</span>
                )
              ) : (
                <>
                  <span>{dict.auth.haveAccountPrompt}</span>
                  <Link href="/login" className="uppercase text-ink underline underline-offset-4">
                    {dict.auth.goToLogin}
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
