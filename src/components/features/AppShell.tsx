"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AuthUserDTO } from "@/components/features/types";
import { festivalHomePath } from "@/domain/festival-routes";
import { useI18n } from "@/i18n/context";

export interface ShellUpcomingFestival {
  id: string;
  brandSlug: string;
  slug: string;
  name: string;
  year: number;
  location: string | null;
  datesLabel: string;
}

interface AppShellProps {
  currentUser: AuthUserDTO;
  upcomingFestivals: ShellUpcomingFestival[];
  unreadNotificationsCount: number;
  incomingRequestsCount: number;
  children: ReactNode;
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M2.5 11.5V6.5M6.25 14.5V3.5M10 12.5V5.5M13.75 15V2.5M16 10.5V7.5" />
    </svg>
  );
}

function FestivalsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="miter"
    >
      <path d="M1.5 4.5H16.5V7.5L15 9L16.5 10.5V13.5H1.5V10.5L3 9L1.5 7.5V4.5Z" />
      <path d="M11.5 4.5V6.5M11.5 8V10M11.5 11.5V13.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-[17px] w-[17px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function SocialIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="miter"
    >
      <circle cx="6.5" cy="5.75" r="2.5" />
      <path d="M2 15V12.5L4 10.75H9L11 12.5V15" />
      <circle cx="12.5" cy="6.25" r="2" />
      <path d="M12.5 10.75H14.5L16.25 12.25V15" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="miter"
    >
      <path d="M9 2V3.5M5 7.5C5 5.29 6.79 3.5 9 3.5C11.21 3.5 13 5.29 13 7.5V11.5L15 13.5H3L5 11.5V7.5Z" />
      <path d="M7.25 13.5V14.5C7.25 15.46 8.04 16.25 9 16.25C9.96 16.25 10.75 15.46 10.75 14.5V13.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4.5 2V16M9 2V16M13.5 2V16" />
      <rect x="3" y="4.5" width="3" height="2.5" fill="currentColor" stroke="none" />
      <rect x="7.5" y="10.5" width="3" height="2.5" fill="currentColor" stroke="none" />
      <rect x="12" y="6.5" width="3" height="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AppShell({
  currentUser,
  upcomingFestivals,
  unreadNotificationsCount,
  incomingRequestsCount,
  children,
}: AppShellProps) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const mobileHeaderRef = useRef<HTMLElement>(null);
  const [scrollTitle, setScrollTitle] = useState<string>("");
  const [showScrollTitle, setShowScrollTitle] = useState(false);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Unified mobile scroll header: watches any page or festival primary heading
  useEffect(() => {
    if (!pathname || isAuthPage) {
      return;
    }
    setShowScrollTitle(false);

    const heading =
      document.querySelector<HTMLElement>("[data-page-heading]") ??
      document.querySelector<HTMLElement>("[data-festival-heading]") ??
      document.querySelector<HTMLElement>("main h1");

    if (!heading) {
      setScrollTitle("");
      return;
    }

    setScrollTitle(heading.textContent?.trim() ?? "");
    const headerHeight = Math.round(mobileHeaderRef.current?.getBoundingClientRect().height ?? 48);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        const scrolledPast =
          !entry.isIntersecting && entry.boundingClientRect.bottom <= headerHeight + 2;
        setShowScrollTitle(scrolledPast);
      },
      {
        rootMargin: `-${headerHeight}px 0px 0px 0px`,
        threshold: 0,
      },
    );

    observer.observe(heading);
    return () => observer.disconnect();
  }, [pathname, isAuthPage]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  const isHome = pathname === "/";
  const isFestivalsRoot = pathname === "/festivals";
  const isInsideFestival =
    pathname.startsWith("/festivals/") ||
    pathname === "/lineup" ||
    pathname === "/festival-mode" ||
    pathname === "/manage" ||
    pathname === "/import";
  const isSearch = pathname === "/search";
  const isSocial = pathname === "/social" || pathname.startsWith("/u/");
  const isNotifications = pathname === "/notifications";
  const isSettings = pathname === "/settings";
  const isAdmin = pathname === "/admin";

  const hasUnread = unreadNotificationsCount > 0;
  const hasIncomingRequests = incomingRequestsCount > 0;

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-bg text-ink wide:mx-auto wide:max-w-[1800px] wide:border-x wide:border-line">
      <div className="kue-shell-frame flex min-h-dvh w-full flex-col sm:flex-row">
        {/* TIER 1 (Phone V): Minimal TopBar with unified scroll title + Notifications bell */}
        <header
          ref={mobileHeaderRef}
          className="kue-top-bar kue-shell-mobile-bar sticky top-0 z-40 border-b border-line bg-bg"
        >
          <div className="flex h-12 items-stretch justify-between">
            <div className="flex min-w-0 flex-1 items-stretch">
              <Link
                href="/"
                aria-label={dict.nav.logoAria}
                className="flex shrink-0 select-none items-center border-r border-line px-3.5 font-display text-[1.25rem] font-extrabold uppercase leading-none tracking-[-0.04em] transition-colors hover:bg-acid hover:text-acid-ink"
              >
                KUE
              </Link>
              <div
                aria-hidden="true"
                className={`flex min-w-0 flex-1 items-center overflow-hidden px-3 transition-all duration-200 motion-reduce:transition-none ${
                  showScrollTitle && scrollTitle
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-1 opacity-0"
                }`}
              >
                <span className="truncate font-display text-[0.9rem] font-extrabold uppercase leading-none tracking-[-0.02em] text-ink">
                  {scrollTitle}
                </span>
              </div>
            </div>

            <Link
              href="/notifications"
              aria-label={dict.nav.notifications}
              aria-current={isNotifications ? "page" : undefined}
              className={`relative flex w-12 shrink-0 items-center justify-center border-l border-line transition-colors ${
                isNotifications ? "bg-surface text-ink" : "text-ink hover:bg-surface"
              }`}
            >
              {isNotifications ? (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-acid" />
              ) : null}
              <BellIcon />
              {hasUnread ? (
                <span
                  aria-hidden="true"
                  className="absolute top-2.5 right-2.5 h-[7px] w-[7px] bg-acid"
                />
              ) : null}
            </Link>
          </div>
        </header>

        {/* TIER 2a (Phone H 56px) & TIER 2b (Tablet V 74px): Compact Left Rail */}
        <aside
          aria-label={dict.nav.mainAria}
          className="kue-shell-rail sticky top-0 h-dvh shrink-0 flex-col justify-between border-r border-line bg-bg"
        >
          <div>
            <Link
              href="/"
              aria-label={dict.nav.logoAria}
              className="flex h-12 w-full items-center justify-center border-b border-line font-display text-[1.15rem] font-extrabold uppercase leading-none tracking-[-0.04em] transition-colors hover:bg-acid hover:text-acid-ink sm:h-14"
            >
              KUE
            </Link>
            <nav className="flex flex-col">
              {[
                { href: "/", label: dict.nav.home, active: isHome, icon: <HomeIcon /> },
                {
                  href: "/festivals",
                  label: dict.nav.festivals,
                  active: isFestivalsRoot || isInsideFestival,
                  icon: <FestivalsIcon />,
                },
                { href: "/search", label: dict.nav.search, active: isSearch, icon: <SearchIcon /> },
                {
                  href: "/social",
                  label: dict.nav.social,
                  active: isSocial,
                  icon: <SocialIcon />,
                  dot: hasIncomingRequests,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={item.active ? "page" : undefined}
                  className={`relative flex min-h-11 flex-col items-center justify-center gap-1 border-b border-line px-1 py-3 transition-colors ${
                    item.active
                      ? "bg-surface font-semibold text-ink"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {item.active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-acid"
                    />
                  ) : null}
                  <span className="relative">
                    {item.icon}
                    {item.dot ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-1.5 h-[6px] w-[6px] bg-acid"
                      />
                    ) : null}
                  </span>
                  <span className="kue-shell-rail-label max-w-full truncate font-mono text-[0.55rem] uppercase leading-none tracking-[0.04em]">
                    {item.label}
                  </span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-col border-t border-line">
            <Link
              href="/notifications"
              title={dict.nav.notifications}
              aria-label={dict.nav.notifications}
              aria-current={isNotifications ? "page" : undefined}
              className={`relative flex min-h-11 flex-col items-center justify-center gap-1 border-b border-line px-1 py-2.5 transition-colors ${
                isNotifications
                  ? "bg-surface font-semibold text-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {isNotifications ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-acid" />
              ) : null}
              <span className="relative">
                <BellIcon />
                {hasUnread ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-1.5 h-[6px] w-[6px] bg-acid"
                  />
                ) : null}
              </span>
              <span className="kue-shell-rail-label max-w-full truncate font-mono text-[0.55rem] uppercase leading-none tracking-[0.04em]">
                {dict.nav.notificationsShort}
              </span>
            </Link>

            {currentUser.role === "ADMIN" ? (
              <Link
                href="/admin"
                title={dict.nav.admin}
                aria-label={dict.nav.admin}
                aria-current={isAdmin ? "page" : undefined}
                className={`relative flex min-h-10 items-center justify-center border-b border-line px-1 py-2 font-mono text-[0.58rem] uppercase tracking-[0.06em] transition-colors ${
                  isAdmin
                    ? "bg-acid font-semibold text-acid-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {dict.nav.admin}
              </Link>
            ) : null}

            <Link
              href="/settings"
              title={dict.nav.settings}
              aria-label={dict.nav.settings}
              aria-current={isSettings ? "page" : undefined}
              className={`relative flex min-h-11 flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
                isSettings
                  ? "bg-surface font-semibold text-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {isSettings ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-acid" />
              ) : null}
              <SettingsIcon />
              <span className="kue-shell-rail-label max-w-full truncate font-mono text-[0.55rem] uppercase leading-none tracking-[0.04em]">
                {dict.nav.settings}
              </span>
            </Link>
          </div>
        </aside>

        {/* TIER 3–5 (Tablet H / Desktop / Wide): Full Left Sidebar (228px) */}
        <aside
          aria-label={dict.nav.mainAria}
          className="kue-shell-sidebar sticky top-0 h-dvh shrink-0 flex-col justify-between border-r border-line bg-bg"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Link
              href="/"
              aria-label={dict.nav.logoAria}
              className="flex h-14 shrink-0 items-center border-b border-line px-5 font-display text-[1.45rem] font-extrabold uppercase leading-none tracking-[-0.04em] transition-colors hover:bg-acid hover:text-acid-ink"
            >
              KUE
            </Link>

            <nav className="flex flex-col border-b border-line">
              {[
                { href: "/", label: dict.nav.home, active: isHome, icon: <HomeIcon /> },
                {
                  href: "/festivals",
                  label: dict.nav.festivals,
                  active: isFestivalsRoot,
                  icon: <FestivalsIcon />,
                },
                { href: "/search", label: dict.nav.search, active: isSearch, icon: <SearchIcon /> },
                {
                  href: "/social",
                  label: dict.nav.social,
                  active: isSocial,
                  icon: <SocialIcon />,
                  dot: hasIncomingRequests,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`relative flex h-11 items-center justify-between border-b border-line px-5 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors last:border-b-0 ${
                    item.active
                      ? "bg-surface font-semibold text-ink"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {item.active ? (
                    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-acid" />
                  ) : null}
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.dot ? (
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 bg-acid" />
                  ) : null}
                </Link>
              ))}
            </nav>

            {upcomingFestivals.length > 0 ? (
              <div className="flex flex-col">
                <div className="border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-ink-muted">
                  {dict.nav.upcomingFestivals}
                </div>
                {upcomingFestivals.map((fest) => {
                  const targetHref = festivalHomePath({
                    brandSlug: fest.brandSlug,
                    year: fest.year,
                  });
                  const isActiveHere =
                    pathname === targetHref || pathname.startsWith(`${targetHref}/`);
                  return (
                    <Link
                      key={fest.id}
                      href={targetHref}
                      aria-current={isActiveHere ? "page" : undefined}
                      className={`relative border-b border-line px-5 py-3 transition-colors hover:bg-surface ${
                        isActiveHere ? "bg-surface" : ""
                      }`}
                    >
                      {isActiveHere ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-1 bg-acid"
                        />
                      ) : null}
                      <div className="truncate font-display text-[0.88rem] font-extrabold uppercase leading-tight tracking-[-0.02em] text-ink">
                        {fest.name} {fest.year}
                      </div>
                      <div className="mt-0.5 truncate font-serif text-[0.82rem] italic text-ink-muted">
                        {fest.location ? `${fest.location} · ` : ""}
                        <span className="font-mono text-[0.64rem] not-italic uppercase">
                          {fest.datesLabel}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col border-t border-line">
            <Link
              href="/notifications"
              aria-current={isNotifications ? "page" : undefined}
              className={`relative flex h-11 items-center justify-between border-b border-line px-5 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
                isNotifications
                  ? "bg-surface font-semibold text-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {isNotifications ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-acid" />
              ) : null}
              <span className="flex items-center gap-3">
                <BellIcon />
                <span>{dict.nav.notifications}</span>
              </span>
              {hasUnread ? (
                <span className="bg-acid px-1.5 py-0.5 font-mono text-[0.64rem] font-semibold leading-none text-acid-ink">
                  {unreadNotificationsCount}
                </span>
              ) : null}
            </Link>

            {currentUser.role === "ADMIN" ? (
              <Link
                href="/admin"
                aria-current={isAdmin ? "page" : undefined}
                className={`relative flex h-11 items-center gap-3 border-b border-line px-5 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
                  isAdmin
                    ? "bg-surface font-semibold text-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {isAdmin ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-acid" />
                ) : null}
                <span>{dict.nav.admin}</span>
              </Link>
            ) : null}

            <Link
              href="/settings"
              aria-current={isSettings ? "page" : undefined}
              className={`relative flex h-12 items-center gap-3 px-5 font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
                isSettings
                  ? "bg-surface font-semibold text-ink"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {isSettings ? (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-acid" />
              ) : null}
              <SettingsIcon />
              <span>{dict.nav.settings}</span>
            </Link>
          </div>
        </aside>

        {/* Main Viewport Content */}
        <div className="kue-shell-content flex min-h-dvh min-w-0 flex-1 flex-col">{children}</div>
      </div>

      {/* TIER 1 (Phone V): 5-column BottomNav (NO central festival button, NO numbers) */}
      <nav
        aria-label={dict.nav.bottomAria}
        className="kue-bottom-nav kue-shell-bottom-nav fixed z-50 grid-cols-5 border-t border-line-strong bg-bg"
      >
        {[
          { href: "/", label: dict.nav.home, active: isHome, icon: <HomeIcon /> },
          {
            href: "/festivals",
            label: dict.nav.festivals,
            active: isFestivalsRoot || isInsideFestival,
            icon: <FestivalsIcon />,
          },
          { href: "/search", label: dict.nav.search, active: isSearch, icon: <SearchIcon /> },
          {
            href: "/social",
            label: dict.nav.social,
            active: isSocial,
            icon: <SocialIcon />,
            dot: hasIncomingRequests,
          },
          {
            href: "/settings",
            label: dict.nav.settings,
            active: isSettings || isAdmin,
            icon: <SettingsIcon />,
          },
        ].map((item, idx) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors ${
              idx < 4 ? "border-r border-line" : ""
            } ${
              item.active
                ? "bg-surface font-semibold text-ink"
                : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {item.active ? (
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-acid" />
            ) : null}
            <span className="relative">
              {item.icon}
              {item.dot ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1.5 h-[6px] w-[6px] bg-acid"
                />
              ) : null}
            </span>
            <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
              {item.label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
