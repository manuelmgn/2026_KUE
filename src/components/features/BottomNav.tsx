"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { FestivalSummary } from "@/components/features/types";
import { useI18n } from "@/i18n/context";

interface BottomNavProps {
  festivals: FestivalSummary[];
}

export function BottomNav({ festivals }: BottomNavProps) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const menuId = useId();
  const [festivalMenuOpen, setFestivalMenuOpen] = useState(false);

  const requestedSlug = searchParams.get("festival");
  const activeFestival =
    (requestedSlug ? festivals.find((fest) => fest.slug === requestedSlug) : undefined) ??
    festivals[0] ??
    null;

  const festivalSuffix = activeFestival
    ? `?festival=${encodeURIComponent(activeFestival.slug)}`
    : "";

  useEffect(() => {
    void pathname;
    void requestedSlug;
    setFestivalMenuOpen(false);
  }, [pathname, requestedSlug]);

  useEffect(() => {
    if (!festivalMenuOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFestivalMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [festivalMenuOpen]);

  const isHome = pathname === "/";
  const isFestivals = pathname === "/festivals";
  const isFestivalSubRoute =
    pathname === "/festival-mode" || pathname === "/manage" || pathname === "/import";
  const isSettings = pathname === "/settings";
  const isCenterActive = festivalMenuOpen || isFestivalSubRoute;

  const festivalOptions = [
    { index: "01", href: `/${festivalSuffix}`, path: "/", label: dict.nav.lineup },
    {
      index: "02",
      href: `/festival-mode${festivalSuffix}`,
      path: "/festival-mode",
      label: dict.nav.festivalMode,
    },
    {
      index: "03",
      href: `/manage${festivalSuffix}`,
      path: "/manage",
      label: dict.nav.manage,
    },
  ];

  return (
    <>
      {festivalMenuOpen ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label={dict.common.close}
            onClick={() => setFestivalMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/60"
          />
          <section
            id={menuId}
            aria-label={dict.nav.festivalMenuAria}
            className="kue-bottom-sheet fixed z-50 border-t border-line-strong bg-bg"
          >
            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-extrabold uppercase tracking-[-0.02em] text-ink">
                  {activeFestival
                    ? `${activeFestival.name} ${activeFestival.year}`
                    : dict.nav.festivalFallback}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFestivalMenuOpen(false)}
                className="shrink-0 cursor-pointer border border-line px-2 py-1 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink"
              >
                {dict.common.close}
              </button>
            </div>

            <ul>
              {festivalOptions.map((option) => {
                const isCurrent =
                  pathname === option.path || (option.path === "/manage" && pathname === "/import");
                return (
                  <li key={option.path} className="border-b border-line last:border-b-0">
                    <Link
                      href={option.href}
                      aria-current={isCurrent ? "page" : undefined}
                      onClick={() => setFestivalMenuOpen(false)}
                      className={`flex min-h-[52px] items-center justify-between px-4 font-mono text-[0.8rem] uppercase tracking-[0.08em] transition-colors ${
                        isCurrent
                          ? "border-l-4 border-l-acid bg-surface-elevated pl-3 font-semibold text-ink"
                          : "text-ink hover:bg-surface-elevated"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="text-[0.68rem] text-ink-muted">
                          {option.index}
                        </span>
                        <span>{option.label}</span>
                      </span>
                      {isCurrent ? (
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 shrink-0 bg-acid"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}

      <nav
        aria-label={dict.nav.bottomAria}
        className="kue-bottom-nav fixed z-50 grid grid-cols-5 border-t border-line-strong bg-bg md:hidden"
      >
        {/* 1. Início — Set C (audio pulse) */}
        <Link
          href={`/${festivalSuffix}`}
          aria-current={isHome ? "page" : undefined}
          className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 transition-colors ${
            isHome
              ? "bg-surface font-semibold text-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {isHome ? (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-acid" />
          ) : null}
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
          <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
            {dict.nav.home}
          </span>
        </Link>

        {/* 2. Festivais — Set A (notched ticket pass) */}
        <Link
          href={`/festivals${festivalSuffix}`}
          aria-current={isFestivals ? "page" : undefined}
          className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 transition-colors ${
            isFestivals
              ? "bg-surface font-semibold text-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {isFestivals ? (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-acid" />
          ) : null}
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
          <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
            {dict.nav.festivals}
          </span>
        </Link>

        {/* 3. Active festival menu trigger — Lightning bolt */}
        <button
          type="button"
          aria-expanded={festivalMenuOpen}
          aria-controls={menuId}
          aria-label={dict.nav.festivalMenuAria}
          onClick={() => setFestivalMenuOpen((prev) => !prev)}
          className={`relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 transition-colors ${
            festivalMenuOpen
              ? "bg-acid font-semibold text-acid-ink"
              : isCenterActive
                ? "bg-surface font-semibold text-ink"
                : "text-ink hover:bg-surface"
          }`}
        >
          {isCenterActive && !festivalMenuOpen ? (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-acid" />
          ) : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 18 18"
            className="h-[18px] w-[18px] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="miter"
          >
            <path d="M10.25 1.75L3.75 10H9L7.75 16.25L14.25 8H9L10.25 1.75Z" />
          </svg>
          <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
            {activeFestival ? activeFestival.name : dict.nav.festivalFallback}
          </span>
        </button>

        {/* 4. Buscar — classic magnifying glass (pending / disabled) */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title={dict.nav.searchPendingTitle}
          className="relative flex min-h-14 min-w-0 cursor-not-allowed flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 text-ink-muted opacity-45"
        >
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
          <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
            {dict.nav.search}
          </span>
        </button>

        {/* 5. Definições — Set A (vertical mixer faders) */}
        <Link
          href={`/settings${festivalSuffix}`}
          aria-current={isSettings ? "page" : undefined}
          className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors ${
            isSettings
              ? "bg-surface font-semibold text-ink"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {isSettings ? (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-acid" />
          ) : null}
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
          <span className="max-w-full truncate font-mono text-[0.58rem] uppercase leading-none tracking-[0.04em]">
            {dict.nav.settings}
          </span>
        </Link>
      </nav>
    </>
  );
}
