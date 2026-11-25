"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FestivalSummary } from "@/components/features/types";
import { KueLogo } from "@/components/ui/KueLogo";

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

function applyTheme(next: "dark" | "light") {
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", next);
  }
  try {
    localStorage.setItem("kue-theme", next);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function TopBar({ festivals, activeFestivalSlug }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [syncInfo, setSyncInfo] = useState<SyncApiSnapshot["counts"] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const wasSyncingRef = useRef(false);
  const restartPollRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);

    const onStorage = (event: StorageEvent) => {
      if (event.key === "kue-theme") {
        const syncedTheme = event.newValue === "light" ? "light" : "dark";
        setTheme(syncedTheme);
        applyTheme(syncedTheme);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
    const targetPath = pathname === "/import" ? "/" : pathname;
    router.push(`${targetPath}?${params.toString()}`);
  };

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  const festivalSuffix = activeFestivalSlug
    ? `?festival=${encodeURIComponent(activeFestivalSlug)}`
    : "";

  const isSyncing = syncInfo !== null && syncInfo.pending + syncInfo.syncing > 0;
  const failedCount = syncInfo?.failed ?? 0;
  const doneCount = syncInfo ? syncInfo.synced + syncInfo.failed : 0;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-stretch justify-between border-b border-line bg-bg">
      <div className="flex min-w-0 items-stretch">
        <KueLogo href={`/${festivalSuffix}`} />
        {festivals.length > 0 ? (
          <select
            aria-label="Seleccionar festival"
            value={activeFestivalSlug ?? festivals[0]?.slug ?? ""}
            onChange={(event) => handleFestivalChange(event.target.value)}
            className="cursor-pointer border-r border-line bg-bg px-[18px] font-mono text-[0.78rem] uppercase tracking-[0.06em] text-ink outline-none"
          >
            {festivals.map((fest) => (
              <option key={fest.id} value={fest.slug} className="bg-bg text-ink">
                {fest.name} {fest.year}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <nav aria-label="Navegación principal" className="flex items-stretch">
        <Link
          href={`/${festivalSuffix}`}
          className={`flex items-center border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            pathname === "/" ? "bg-ink text-bg" : "text-ink hover:bg-surface-elevated"
          }`}
        >
          Cartel
        </Link>
        <Link
          href={`/festival-mode${festivalSuffix}`}
          className={`flex items-center border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            pathname === "/festival-mode" ? "bg-ink text-bg" : "text-ink hover:bg-surface-elevated"
          }`}
        >
          Modo Festival
        </Link>
        <Link
          href={`/import${festivalSuffix}`}
          className={`flex items-center border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] transition-colors ${
            pathname === "/import" ? "bg-ink text-bg" : "text-ink hover:bg-surface-elevated"
          }`}
        >
          Importar
        </Link>
        {isSyncing && syncInfo ? (
          <div
            aria-live="polite"
            className="hidden items-center border-l border-line px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted md:flex"
          >
            SYNC {doneCount}/{syncInfo.total}
          </div>
        ) : failedCount > 0 ? (
          <button
            type="button"
            disabled={retrying}
            onClick={() => void handleRetrySync()}
            title="Reintentar artistas con error de sincronización"
            className="hidden cursor-pointer items-center border-l border-line px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:bg-acid hover:text-acid-ink disabled:opacity-40 md:flex"
          >
            {retrying ? "REINTENTANDO..." : `REINTENTAR (${failedCount})`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleToggleTheme}
          className="flex cursor-pointer items-center border-l border-line px-[18px] font-mono text-[0.76rem] uppercase tracking-[0.08em] text-ink-muted transition-colors hover:bg-surface-elevated hover:text-ink"
        >
          {theme === "dark" ? "Claro" : "Oscuro"}
        </button>
      </nav>
    </header>
  );
}
