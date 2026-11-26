"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FestivalSummary } from "@/components/features/types";
import { KueLogo } from "@/components/ui/KueLogo";
import { useI18n } from "@/i18n/context";

interface TopBarProps {
  festivals: FestivalSummary[];
  activeFestivalSlug: string | null;
}

interface SyncApiSnapshot {
  counts: {
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    total: number;
  };
}

export function TopBar({ festivals, activeFestivalSlug }: TopBarProps) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [syncInfo, setSyncInfo] = useState<SyncApiSnapshot["counts"] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showMobileTitle, setShowMobileTitle] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const wasSyncingRef = useRef(false);
  const restartPollRef = useRef<(() => void) | null>(null);

  const activeFestival =
    (activeFestivalSlug ? festivals.find((fest) => fest.slug === activeFestivalSlug) : undefined) ??
    festivals[0] ??
    null;

  useEffect(() => {
    void pathname;
    void activeFestivalSlug;
    setShowMobileTitle(false);

    const heading = document.querySelector<HTMLElement>("[data-festival-heading]");
    if (!heading) {
      return;
    }

    const headerHeight = Math.round(headerRef.current?.getBoundingClientRect().height ?? 56);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) {
          return;
        }
        const scrolledPastHeader =
          !entry.isIntersecting && entry.boundingClientRect.bottom <= headerHeight + 2;
        setShowMobileTitle(scrolledPastHeader);
      },
      {
        rootMargin: `-${headerHeight}px 0px 0px 0px`,
        threshold: 0,
      },
    );

    observer.observe(heading);
    return () => observer.disconnect();
  }, [pathname, activeFestivalSlug]);

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const pollSync = async () => {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok || cancelled) {
          return;
        }
        const data = (await res.json()) as SyncApiSnapshot;
        if (cancelled) {
          return;
        }
        setSyncInfo(data.counts);
        const activeCount = data.counts.pending + data.counts.syncing;
        if (activeCount > 0) {
          wasSyncingRef.current = true;
          timerId = setTimeout(pollSync, 3500);
        } else if (wasSyncingRef.current) {
          wasSyncingRef.current = false;
          router.refresh();
        }
      } catch {
        // Silent background check
      }
    };

    restartPollRef.current = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = undefined;
      }
      void pollSync();
    };

    void pollSync();
    return () => {
      cancelled = true;
      restartPollRef.current = null;
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [router]);

  const handleRetrySync = async () => {
    setRetrying(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      restartPollRef.current?.();
    } finally {
      setRetrying(false);
    }
  };

  const handleFestivalChange = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("festival", slug);
    const targetPath =
      pathname === "/import" || pathname === "/settings" || pathname === "/festivals"
        ? "/lineup"
        : pathname;
    router.push(`${targetPath}?${params.toString()}`);
  };

  const festivalSuffix = activeFestivalSlug
    ? `?festival=${encodeURIComponent(activeFestivalSlug)}`
    : "";

  const isSyncing = syncInfo !== null && syncInfo.pending + syncInfo.syncing > 0;
  const failedCount = syncInfo?.failed ?? 0;
  const doneCount = syncInfo ? syncInfo.synced + syncInfo.failed : 0;

  return (
    <header ref={headerRef} className="kue-top-bar sticky top-0 z-40 border-b border-line bg-bg">
      <div className="flex h-14 items-stretch justify-between">
        <div className="flex min-w-0 flex-1 items-stretch md:flex-none">
          <KueLogo href={`/${festivalSuffix}`} />
          {activeFestival ? (
            <div
              aria-hidden="true"
              className={`flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3.5 transition-all duration-200 motion-reduce:transition-none md:hidden ${
                showMobileTitle
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1.5 opacity-0"
              }`}
            >
              <span className="truncate font-display text-[0.95rem] font-extrabold uppercase leading-none tracking-[-0.02em] text-ink">
                {activeFestival.name}
              </span>
              <span className="shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                {activeFestival.year}
              </span>
            </div>
          ) : null}
          {festivals.length > 0 ? (
            <div className="relative hidden min-w-0 items-stretch border-r border-line md:flex">
              <select
                aria-label={dict.nav.selectFestivalAria}
                value={activeFestivalSlug ?? festivals[0]?.slug ?? ""}
                onChange={(event) => handleFestivalChange(event.target.value)}
                className="max-w-[220px] cursor-pointer appearance-none truncate bg-bg pl-[18px] pr-9 font-mono text-[0.76rem] uppercase tracking-[0.06em] text-ink outline-none"
              >
                {festivals.map((fest) => (
                  <option key={fest.id} value={fest.slug} className="bg-bg text-ink">
                    {fest.name} {fest.year}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M2.5 4.25L6 7.75L9.5 4.25" />
              </svg>
            </div>
          ) : null}
        </div>

        <nav
          aria-label={dict.nav.mainAria}
          className="hidden min-w-0 items-stretch md:flex md:flex-none"
        >
          <Link
            href={`/lineup${festivalSuffix}`}
            aria-current={pathname === "/lineup" ? "page" : undefined}
            className={`flex items-center justify-center whitespace-nowrap border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
              pathname === "/lineup"
                ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
                : "text-ink hover:bg-surface-elevated"
            }`}
          >
            {dict.nav.lineup}
          </Link>

          <Link
            href={`/festival-mode${festivalSuffix}`}
            aria-current={pathname === "/festival-mode" ? "page" : undefined}
            className={`flex items-center justify-center whitespace-nowrap border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
              pathname === "/festival-mode"
                ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
                : "text-ink hover:bg-surface-elevated"
            }`}
          >
            {dict.nav.festivalMode}
          </Link>

          <Link
            href={`/manage${festivalSuffix}`}
            aria-current={pathname === "/manage" || pathname === "/import" ? "page" : undefined}
            className={`flex items-center justify-center whitespace-nowrap border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
              pathname === "/manage" || pathname === "/import"
                ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
                : "text-ink hover:bg-surface-elevated"
            }`}
          >
            {dict.nav.manage}
          </Link>

          <Link
            href={`/festivals${festivalSuffix}`}
            aria-current={pathname === "/festivals" ? "page" : undefined}
            className={`hidden items-center justify-center whitespace-nowrap border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors md:flex ${
              pathname === "/festivals"
                ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
                : "text-ink hover:bg-surface-elevated"
            }`}
          >
            {dict.nav.festivals}
          </Link>

          <Link
            href={`/settings${festivalSuffix}`}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={`hidden items-center justify-center whitespace-nowrap border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors md:flex ${
              pathname === "/settings"
                ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
                : "text-ink hover:bg-surface-elevated"
            }`}
          >
            {dict.nav.settings}
          </Link>

          {isSyncing && syncInfo ? (
            <div
              aria-live="polite"
              className="hidden items-center whitespace-nowrap border-l border-line px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted lg:flex"
            >
              {dict.nav.syncStatus(doneCount, syncInfo.total)}
            </div>
          ) : failedCount > 0 ? (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void handleRetrySync()}
              title={dict.nav.retrySyncTitle}
              className="hidden cursor-pointer items-center whitespace-nowrap border-l border-line px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:bg-acid hover:text-acid-ink disabled:opacity-40 lg:flex"
            >
              {retrying ? dict.nav.retryingSync : dict.nav.retrySync(failedCount)}
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
