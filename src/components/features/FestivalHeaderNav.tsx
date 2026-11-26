"use client";

import Link from "next/link";
import {
  festivalAgendaPath,
  festivalCartelPath,
  festivalComparisonPath,
  festivalEditPath,
  festivalHomePath,
} from "@/domain/festival-routes";
import { useI18n } from "@/i18n/context";

export type FestivalSectionTab = "home" | "cartel" | "agenda" | "grupo" | "editar";

interface FestivalHeaderNavProps {
  brandSlug: string;
  name: string;
  year: number;
  location?: string | null;
  datesLabel?: string | null;
  activeTab: FestivalSectionTab;
  /** When true, only renders the sticky Level 2 tab bar (used on Festival Home which renders its own Hero above) */
  tabsOnly?: boolean;
  rightSlot?: React.ReactNode;
}

export function FestivalHeaderNav({
  brandSlug,
  name,
  year,
  location,
  datesLabel,
  activeTab,
  tabsOnly = false,
  rightSlot,
}: FestivalHeaderNavProps) {
  const { dict } = useI18n();
  const target = { brandSlug, year };

  const tabs: Array<{ id: FestivalSectionTab; label: string; href: string }> = [
    { id: "home", label: dict.nav.festivalHome, href: festivalHomePath(target) },
    { id: "cartel", label: dict.nav.lineup, href: festivalCartelPath(target) },
    { id: "agenda", label: dict.nav.festivalMode, href: festivalAgendaPath(target) },
    { id: "grupo", label: dict.nav.groupPlanning, href: festivalComparisonPath(target) },
    { id: "editar", label: dict.nav.manage, href: festivalEditPath(target) },
  ];

  return (
    <>
      {!tabsOnly ? (
        <section className="flex flex-wrap items-end justify-between gap-2 px-4 pt-5 pb-4 sm:gap-4 sm:px-6 sm:pt-7 sm:pb-5">
          <div>
            <h1
              data-festival-heading
              className="font-display text-[clamp(2rem,5vw,4rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.04em]"
            >
              {name} {year}
            </h1>
            {location || datesLabel ? (
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {location ? (
                  <p className="font-serif text-[clamp(1.1rem,2vw,1.5rem)] italic leading-[1.1] text-ink-muted">
                    {location}
                  </p>
                ) : null}
                {datesLabel ? (
                  <span className="font-mono text-[0.72rem] uppercase tracking-[0.06em] text-ink-muted">
                    {datesLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
        </section>
      ) : null}

      <nav
        aria-label={dict.nav.festivalSectionsAria}
        className="sticky top-[var(--kue-sticky-top)] z-30 border-y border-line bg-surface"
      >
        <div className="grid h-11 grid-cols-5 sm:flex sm:items-stretch">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-w-0 items-center justify-center truncate px-1 font-mono text-[0.64rem] uppercase tracking-[0.04em] transition-colors sm:border-r sm:border-line sm:px-6 sm:text-[0.72rem] sm:tracking-[0.08em] ${
                  idx < tabs.length - 1 ? "border-r border-line" : ""
                } ${
                  isActive
                    ? "bg-acid font-semibold text-acid-ink"
                    : "text-ink hover:bg-surface-elevated"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
