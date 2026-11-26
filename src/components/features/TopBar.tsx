"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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

function supportsNativePopover(): boolean {
  return typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "popover");
}

function isPopoverCurrentlyOpen(menu: HTMLElement): boolean {
  if (supportsNativePopover()) {
    try {
      return menu.matches(":popover-open");
    } catch {
      return false;
    }
  }
  return menu.classList.contains(":popover-open");
}

export function TopBar({ festivals, activeFestivalSlug }: TopBarProps) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncInfo, setSyncInfo] = useState<SyncApiSnapshot["counts"] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const wasSyncingRef = useRef(false);
  const restartPollRef = useRef<(() => void) | null>(null);
  const lastHeaderWidthRef = useRef<number>(0);

  const closeMenu = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    if (supportsNativePopover()) {
      if (isPopoverCurrentlyOpen(menu)) {
        menu.hidePopover();
      }
    } else if (menu.classList.contains(":popover-open")) {
      menu.classList.remove(":popover-open");
      setMenuOpen(false);
    }
  }, []);

  // Close popover after client-side navigation
  useEffect(() => {
    void pathname;
    closeMenu();
  }, [pathname, closeMenu]);

  // Measure whether the inline row fits and toggle .is-wide + popover attribute
  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    const brand = brandRef.current;
    const menu = menuRef.current;
    if (!header || !inner || !brand || !menu) {
      return;
    }

    const nativePopover = supportsNativePopover();
    let rafId: number | null = null;

    const measure = (force = false) => {
      const currentWidth = header.clientWidth;
      const isCurrentlyWide = header.classList.contains("is-wide");

      // While collapsed, only remeasure when the header grows (or forced on content change)
      if (!force && !isCurrentlyWide && currentWidth <= lastHeaderWidthRef.current) {
        lastHeaderWidthRef.current = currentWidth;
        return;
      }
      lastHeaderWidthRef.current = currentWidth;

      const wasOpen = !isCurrentlyWide && isPopoverCurrentlyOpen(menu);

      header.classList.add("is-measuring");
      header.classList.add("is-wide");
      menu.removeAttribute("popover");

      const fits = inner.scrollWidth <= inner.clientWidth;

      if (fits) {
        menu.classList.remove(":popover-open");
        setMenuOpen(false);
      } else {
        header.classList.remove("is-wide");
        menu.setAttribute("popover", "auto");
        if (wasOpen) {
          if (nativePopover) {
            try {
              menu.showPopover();
            } catch {
              // Ignore if not connected
            }
          } else {
            menu.classList.add(":popover-open");
            setMenuOpen(true);
          }
        }
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        header.classList.remove("is-measuring");
        rafId = null;
      });
    };

    measure(true);

    const observer = new ResizeObserver((entries) => {
      const contentChanged = entries.some(
        (entry) => entry.target === menu || entry.target === brand,
      );
      measure(contentChanged);
    });
    observer.observe(header);
    observer.observe(brand);
    observer.observe(menu);

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      setMenuOpen(toggleEvent.newState === "open");
    };
    menu.addEventListener("toggle", onToggle);

    // Lightweight fallback for browsers without native Popover API
    const onKeyDown = (event: KeyboardEvent) => {
      if (!nativePopover && event.key === "Escape" && menu.classList.contains(":popover-open")) {
        menu.classList.remove(":popover-open");
        setMenuOpen(false);
      }
    };
    if (!nativePopover) {
      document.addEventListener("keydown", onKeyDown);
    }

    return () => {
      observer.disconnect();
      menu.removeEventListener("toggle", onToggle);
      if (!nativePopover) {
        document.removeEventListener("keydown", onKeyDown);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

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
    const targetPath = pathname === "/import" || pathname === "/settings" ? "/" : pathname;
    router.push(`${targetPath}?${params.toString()}`);
  };

  const handleManualMenuToggle = () => {
    if (supportsNativePopover()) {
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const nextOpen = !menu.classList.contains(":popover-open");
    menu.classList.toggle(":popover-open", nextOpen);
    setMenuOpen(nextOpen);
  };

  const festivalSuffix = activeFestivalSlug
    ? `?festival=${encodeURIComponent(activeFestivalSlug)}`
    : "";

  const isSyncing = syncInfo !== null && syncInfo.pending + syncInfo.syncing > 0;
  const failedCount = syncInfo?.failed ?? 0;
  const doneCount = syncInfo ? syncInfo.synced + syncInfo.failed : 0;
  const hasSyncAlert = isSyncing || failedCount > 0;

  const navItems = [
    { index: "01", href: `/${festivalSuffix}`, path: "/", label: dict.nav.lineup },
    {
      index: "02",
      href: `/festival-mode${festivalSuffix}`,
      path: "/festival-mode",
      label: dict.nav.festivalMode,
    },
    { index: "03", href: `/import${festivalSuffix}`, path: "/import", label: dict.nav.import },
    {
      index: "04",
      href: `/settings${festivalSuffix}`,
      path: "/settings",
      label: dict.nav.settings,
    },
  ];

  const popoverTargetProps = {
    popoverTarget: menuId,
    popoverTargetAction: "toggle",
  } as Record<string, string>;

  const initialPopoverProps = {
    popover: "auto",
  } as Record<string, string>;

  return (
    <header
      ref={headerRef}
      className="kue-header sticky top-0 z-40 h-14 border-b border-line bg-bg"
    >
      <div ref={innerRef} className="kue-header-inner">
        <div ref={brandRef} className="kue-header-brand">
          <KueLogo href={`/${festivalSuffix}`} />
          {festivals.length > 0 ? (
            <div className="relative flex min-w-0 flex-1 items-stretch border-r border-line">
              <select
                aria-label={dict.nav.selectFestivalAria}
                value={activeFestivalSlug ?? festivals[0]?.slug ?? ""}
                onChange={(event) => handleFestivalChange(event.target.value)}
                className="w-full min-w-0 cursor-pointer appearance-none truncate bg-bg pl-3.5 pr-8 font-mono text-[0.76rem] uppercase tracking-[0.06em] text-ink outline-none sm:pl-[18px] sm:pr-9"
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
                className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-muted sm:right-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M2.5 4.25L6 7.75L9.5 4.25" />
              </svg>
            </div>
          ) : null}
        </div>

        <nav aria-label={dict.nav.mainAria} className="kue-header-nav">
          <button
            type="button"
            className={`kue-menu-button flex cursor-pointer items-center gap-2.5 whitespace-nowrap px-4 font-mono text-[0.74rem] uppercase tracking-[0.08em] transition-colors ${
              festivals.length === 0 ? "border-l border-line" : ""
            } ${menuOpen ? "bg-ink text-bg" : "bg-bg text-ink hover:bg-surface-elevated"}`}
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? dict.nav.menuCloseAria : dict.nav.menuOpenAria}
            onClick={handleManualMenuToggle}
            {...popoverTargetProps}
          >
            {menuOpen ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M3 3L13 13M13 3L3 13" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M2 4.5H14M2 8H14M2 11.5H14" />
              </svg>
            )}
            <span>{dict.nav.menu}</span>
            {hasSyncAlert && !menuOpen ? (
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 bg-acid" />
            ) : null}
          </button>

          <ul ref={menuRef} id={menuId} className="kue-site-menu" {...initialPopoverProps}>
            {navItems.map((item) => {
              const isCurrent = pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={closeMenu}
                    className="kue-nav-link font-mono text-[0.78rem] uppercase tracking-[0.08em]"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="kue-nav-index text-[0.68rem] text-ink-muted"
                      >
                        {item.index}
                      </span>
                      <span>{item.label}</span>
                    </span>
                    {isCurrent ? (
                      <span
                        aria-hidden="true"
                        className="kue-nav-active-mark inline-block h-2 w-2 shrink-0 bg-acid"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}

            {isSyncing && syncInfo ? (
              <li className="kue-nav-sync-item">
                <div
                  aria-live="polite"
                  className="kue-nav-sync-control font-mono text-[0.72rem] uppercase tracking-[0.08em]"
                >
                  <span>{dict.nav.syncStatus(doneCount, syncInfo.total)}</span>
                  <span aria-hidden="true" className="kue-nav-active-mark h-1.5 w-1.5 bg-acid" />
                </div>
              </li>
            ) : failedCount > 0 ? (
              <li className="kue-nav-sync-item">
                <button
                  type="button"
                  disabled={retrying}
                  onClick={() => void handleRetrySync()}
                  title={dict.nav.retrySyncTitle}
                  className="kue-nav-sync-control cursor-pointer font-mono text-[0.72rem] uppercase tracking-[0.08em] transition-colors hover:bg-acid hover:text-acid-ink disabled:opacity-40"
                >
                  <span>{retrying ? dict.nav.retryingSync : dict.nav.retrySync(failedCount)}</span>
                  <span aria-hidden="true" className="kue-nav-active-mark h-1.5 w-1.5 bg-acid" />
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}
