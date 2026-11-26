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
  const wasSyncingRef = useRef(false);
  const restartPollRef = useRef<(() => void) | null>(null);

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
        ? "/"
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
    <header className="sticky top-0 z-40 flex h-14 items-stretch justify-between border-b border-line bg-bg">
      <div className="flex min-w-0 shrink-0 items-stretch">
        <KueLogo href={`/${festivalSuffix}`} />
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
        className="flex min-w-0 flex-1 items-stretch md:flex-none"
      >
        <Link
          href={`/${festivalSuffix}`}
          aria-current={pathname === "/" ? "page" : undefined}
          className={`flex flex-1 items-center justify-center whitespace-nowrap border-r border-line px-1.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors md:flex-none md:border-l md:border-r-0 md:px-[18px] md:text-[0.76rem] md:tracking-[0.08em] ${
            pathname === "/"
              ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
              : "text-ink hover:bg-surface-elevated"
          }`}
        >
          {dict.nav.lineup}
        </Link>

        <Link
          href={`/festival-mode${festivalSuffix}`}
          aria-current={pathname === "/festival-mode" ? "page" : undefined}
          className={`flex flex-[1.35] items-center justify-center whitespace-nowrap border-r border-line px-1.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors md:flex-none md:border-l md:border-r-0 md:px-[18px] md:text-[0.76rem] md:tracking-[0.08em] ${
            pathname === "/festival-mode"
              ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
              : "text-ink hover:bg-surface-elevated"
          }`}
        >
          {dict.nav.festivalMode}
        </Link>

        <Link
          href={`/import${festivalSuffix}`}
          aria-current={pathname === "/import" ? "page" : undefined}
          className={`flex flex-1 items-center justify-center whitespace-nowrap px-1.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors md:flex-none md:border-l md:border-line md:px-[18px] md:text-[0.76rem] md:tracking-[0.08em] ${
            pathname === "/import"
              ? "border-b-2 border-b-acid bg-ink font-semibold text-bg"
              : "text-ink hover:bg-surface-elevated"
          }`}
        >
          {dict.nav.import}
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
    </header>
  );
}
