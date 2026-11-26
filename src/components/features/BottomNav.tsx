"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/context";

export function BottomNav() {
  const { dict } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFestival = searchParams.get("festival");
  const festivalSuffix = activeFestival ? `?festival=${encodeURIComponent(activeFestival)}` : "";

  const isHomeSection = pathname === "/" || pathname === "/festival-mode" || pathname === "/import";
  const isFestivals = pathname === "/festivals";
  const isSettings = pathname === "/settings";

  return (
    <nav
      aria-label={dict.nav.bottomAria}
      className="kue-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line-strong bg-bg md:hidden"
    >
      {/* Início — Set C (audio pulse) */}
      <Link
        href={`/${festivalSuffix}`}
        aria-current={pathname === "/" ? "page" : undefined}
        className={`relative flex min-h-14 flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 transition-colors ${
          isHomeSection
            ? "bg-surface font-semibold text-ink"
            : "text-ink-muted hover:bg-surface hover:text-ink"
        }`}
      >
        {isHomeSection ? (
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
        <span className="font-mono text-[0.62rem] uppercase leading-none tracking-[0.06em]">
          {dict.nav.home}
        </span>
      </Link>

      {/* Festivais — Set A (notched ticket pass) */}
      <Link
        href={`/festivals${festivalSuffix}`}
        aria-current={isFestivals ? "page" : undefined}
        className={`relative flex min-h-14 flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 transition-colors ${
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
        <span className="font-mono text-[0.62rem] uppercase leading-none tracking-[0.06em]">
          {dict.nav.festivals}
        </span>
      </Link>

      {/* Buscar — original magnifying glass (pending / disabled) */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={dict.nav.searchPendingTitle}
        className="relative flex min-h-14 cursor-not-allowed flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 text-ink-muted opacity-45"
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
        <span className="font-mono text-[0.62rem] uppercase leading-none tracking-[0.06em]">
          {dict.nav.search}
        </span>
      </button>

      {/* Definições — Set A (vertical mixer faders) */}
      <Link
        href={`/settings${festivalSuffix}`}
        aria-current={isSettings ? "page" : undefined}
        className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors ${
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
        <span className="font-mono text-[0.62rem] uppercase leading-none tracking-[0.06em]">
          {dict.nav.settings}
        </span>
      </Link>
    </nav>
  );
}
