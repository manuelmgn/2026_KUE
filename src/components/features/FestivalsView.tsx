"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  addEditionToMyFestivalsAction,
  createFestivalAction,
  createFestivalEditionAction,
  removeEditionFromMyFestivalsAction,
} from "@/actions/festival-actions";
import { PlaceAutocomplete } from "@/components/features/PlaceAutocomplete";
import type {
  CatalogEditionItemDTO,
  CatalogFestivalDTO,
  FestivalArchiveItemDTO,
} from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { festivalHomePath } from "@/domain/festival-routes";
import type { PlaceCandidate } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FestivalsViewProps {
  initialFestivals: FestivalArchiveItemDTO[];
  initialCatalog: CatalogFestivalDTO[];
  activeFestivalSlug: string | null;
  todayIso: string;
  isAdmin?: boolean;
}

type PanelMode = "closed" | "catalog" | "create-festival" | "create-edition";

function isPastFestival(festival: FestivalArchiveItemDTO, todayIso: string): boolean {
  if (festival.endDate) {
    return festival.endDate < todayIso;
  }
  if (festival.startDate) {
    return festival.startDate < todayIso;
  }
  const currentYear = Number(todayIso.slice(0, 4));
  return festival.year < currentYear;
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  year: number,
  locale: string,
): string {
  if (!startDate && !endDate) {
    return String(year);
  }
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  if (startDate && endDate && startDate !== endDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (start.getUTCFullYear() === end.getUTCFullYear()) {
      return `${shortFmt.format(start)} – ${fmt.format(end)}`;
    }
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  const single = new Date(`${startDate ?? endDate}T00:00:00.000Z`);
  return fmt.format(single);
}

interface GroupedFestival {
  festivalId: string;
  name: string;
  location: string | null;
  editions: FestivalArchiveItemDTO[];
}

function groupByFestival(items: FestivalArchiveItemDTO[]): GroupedFestival[] {
  const groups = new Map<string, GroupedFestival>();
  for (const item of items) {
    const existing = groups.get(item.festivalId);
    if (existing) {
      existing.editions.push(item);
    } else {
      groups.set(item.festivalId, {
        festivalId: item.festivalId,
        name: item.name,
        location: item.location,
        editions: [item],
      });
    }
  }
  return Array.from(groups.values());
}

export function FestivalsView({
  initialFestivals,
  initialCatalog,
  activeFestivalSlug,
  todayIso,
  isAdmin = false,
}: FestivalsViewProps) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const formId = useId();

  const [festivals, setFestivals] = useState<FestivalArchiveItemDTO[]>(initialFestivals);
  const [catalog, setCatalog] = useState<CatalogFestivalDTO[]>(initialCatalog);
  const [panelMode, setPanelMode] = useState<PanelMode>(
    initialFestivals.length === 0 ? "catalog" : "closed",
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [targetBrand, setTargetBrand] = useState<CatalogFestivalDTO | null>(null);
  const [togglingEditionId, setTogglingEditionId] = useState<string | null>(null);

  // Create form state (shared between new festival and new edition)
  const [name, setName] = useState("");
  const [year, setYear] = useState(todayIso.slice(0, 4));
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(null);
  const [locationInvalid, setLocationInvalid] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lineupSourceUrl, setLineupSourceUrl] = useState("");
  const [syncSchedule, setSyncSchedule] = useState<"once" | "12" | "24" | "168">("24");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setYear(todayIso.slice(0, 4));
    setLocationQuery("");
    setSelectedPlace(null);
    setLocationInvalid(false);
    setStartDate("");
    setEndDate("");
    setLineupSourceUrl("");
    setSyncSchedule("24");
    setError(null);
  };

  const openNewEditionForm = (brand: CatalogFestivalDTO) => {
    resetForm();
    setTargetBrand(brand);
    const highestYear = brand.editions[0]?.year;
    const suggestedYear = highestYear ? String(highestYear + 1) : todayIso.slice(0, 4);
    setYear(suggestedYear);
    if (brand.location) {
      setLocationQuery(brand.location);
      setSelectedPlace({
        placeId: brand.locationPlaceId ?? `brand-${brand.id}`,
        name: brand.location,
        province: brand.locationProvince,
        region: brand.locationRegion,
        country: brand.locationCountry,
        countryCode: brand.locationCountryCode,
        latitude: brand.locationLatitude ?? 0,
        longitude: brand.locationLongitude ?? 0,
      });
    }
    setPanelMode("create-edition");
  };

  const openNewFestivalForm = () => {
    resetForm();
    setTargetBrand(null);
    if (catalogQuery.trim()) {
      setName(catalogQuery.trim());
    }
    setPanelMode("create-festival");
  };

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    const yearMatch = nextStart.match(/^(\d{4})-/);
    if (yearMatch?.[1]) {
      setYear(yearMatch[1]);
    }
    if (endDate && nextStart && endDate < nextStart) {
      setEndDate("");
    }
  };

  const handleAddFromCatalog = async (edition: CatalogEditionItemDTO) => {
    setError(null);
    setTogglingEditionId(edition.id);
    try {
      const res = await addEditionToMyFestivalsAction(edition.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFestivals((prev) => (prev.some((f) => f.id === res.data.id) ? prev : [res.data, ...prev]));
      setCatalog((prev) =>
        prev.map((brand) =>
          brand.id === edition.festivalId
            ? {
                ...brand,
                editions: brand.editions.map((ed) =>
                  ed.id === edition.id
                    ? { ...ed, isAdded: true, followersCount: ed.followersCount + 1 }
                    : ed,
                ),
              }
            : brand,
        ),
      );
      router.refresh();
    } finally {
      setTogglingEditionId(null);
    }
  };

  const handleRemoveFromMine = async (editionId: string, festivalId: string) => {
    setError(null);
    setTogglingEditionId(editionId);
    try {
      const res = await removeEditionFromMyFestivalsAction(editionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFestivals((prev) => prev.filter((f) => f.id !== editionId));
      setCatalog((prev) =>
        prev.map((brand) =>
          brand.id === festivalId
            ? {
                ...brand,
                editions: brand.editions.map((ed) =>
                  ed.id === editionId
                    ? {
                        ...ed,
                        isAdded: false,
                        followersCount: Math.max(0, ed.followersCount - 1),
                      }
                    : ed,
                ),
              }
            : brand,
        ),
      );
      router.refresh();
    } finally {
      setTogglingEditionId(null);
    }
  };

  const handleCreateSubmit = async () => {
    setError(null);
    setCreateNotice(null);
    if (locationQuery.trim().length > 0 && !selectedPlace) {
      setLocationInvalid(true);
      setError(dict.importer.locationInvalidError);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError(dict.importer.dateOrderError);
      return;
    }

    const trimmedUrl = lineupSourceUrl.trim();
    const autoSyncEnabled = trimmedUrl.length > 0 && syncSchedule !== "once";
    const syncIntervalHours = syncSchedule === "once" ? 24 : Number(syncSchedule);

    setCreating(true);
    try {
      const isNewEdition = panelMode === "create-edition" && targetBrand !== null;
      const isInheritedBrandPlace =
        isNewEdition && selectedPlace?.placeId === `brand-${targetBrand.id}`;

      const res = isNewEdition
        ? await createFestivalEditionAction({
            festivalId: targetBrand.id,
            year: Number(year),
            location: selectedPlace ? selectedPlace.name : null,
            locationProvince: selectedPlace?.province ?? null,
            locationRegion: selectedPlace?.region ?? null,
            locationCountry: selectedPlace?.country ?? null,
            locationCountryCode: selectedPlace?.countryCode ?? null,
            locationLatitude: selectedPlace?.latitude ?? null,
            locationLongitude: selectedPlace?.longitude ?? null,
            locationPlaceId: isInheritedBrandPlace
              ? targetBrand.locationPlaceId
              : (selectedPlace?.placeId ?? null),
            startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
            endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
            lineupSourceUrl: trimmedUrl || null,
            autoSyncEnabled,
            syncIntervalHours,
          })
        : await createFestivalAction({
            name,
            year: Number(year),
            location: selectedPlace ? selectedPlace.name : undefined,
            locationProvince: selectedPlace?.province ?? null,
            locationRegion: selectedPlace?.region ?? null,
            locationCountry: selectedPlace?.country ?? null,
            locationCountryCode: selectedPlace?.countryCode ?? null,
            locationLatitude: selectedPlace?.latitude ?? null,
            locationLongitude: selectedPlace?.longitude ?? null,
            locationPlaceId: selectedPlace?.placeId ?? null,
            startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
            endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined,
            lineupSourceUrl: trimmedUrl || null,
            autoSyncEnabled,
            syncIntervalHours,
          });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      const createdItem: FestivalArchiveItemDTO = {
        id: res.data.id,
        festivalId: res.data.festivalId,
        brandSlug: res.data.brandSlug,
        slug: res.data.slug,
        name: res.data.name,
        year: res.data.year,
        location: res.data.location,
        startDate: startDate || null,
        endDate: endDate || null,
        entriesCount: res.data.initialEntriesCount,
      };
      setFestivals((prev) => [createdItem, ...prev]);

      // Update local catalog immediately
      const newCatalogEdition: CatalogEditionItemDTO = {
        id: res.data.id,
        festivalId: res.data.festivalId,
        slug: res.data.slug,
        year: res.data.year,
        location: res.data.location,
        startDate: startDate || null,
        endDate: endDate || null,
        entriesCount: res.data.initialEntriesCount,
        followersCount: 1,
        isAdded: true,
      };
      setCatalog((prev) => {
        const exists = prev.some((b) => b.id === res.data.festivalId);
        if (exists) {
          return prev.map((b) =>
            b.id === res.data.festivalId
              ? {
                  ...b,
                  editions: [newCatalogEdition, ...b.editions].sort((a, bEd) => bEd.year - a.year),
                }
              : b,
          );
        }
        return [
          ...prev,
          {
            id: res.data.festivalId,
            slug: res.data.slug,
            name: res.data.name,
            location: res.data.location,
            locationProvince: selectedPlace?.province ?? null,
            locationRegion: selectedPlace?.region ?? null,
            locationCountry: selectedPlace?.country ?? null,
            locationCountryCode: selectedPlace?.countryCode ?? null,
            locationLatitude: selectedPlace?.latitude ?? null,
            locationLongitude: selectedPlace?.longitude ?? null,
            locationPlaceId: selectedPlace?.placeId ?? null,
            editions: [newCatalogEdition],
          },
        ].sort((a, b) => a.name.localeCompare(b.name));
      });

      setPanelMode("closed");
      resetForm();
      if (res.data.initialSyncError) {
        setCreateNotice(dict.manage.autoSync.initialImportWarning(res.data.initialSyncError));
      } else if (res.data.initialEntriesCount > 0) {
        setCreateNotice(
          dict.importer.importedSummary(
            res.data.initialEntriesCount,
            res.data.initialNewArtistsCount,
          ),
        );
      }
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const upcoming = festivals
    .filter((fest) => !isPastFestival(fest, todayIso))
    .sort((a, b) => {
      const aKey = a.startDate ?? `${a.year}-99-99`;
      const bKey = b.startDate ?? `${b.year}-99-99`;
      return aKey.localeCompare(bKey);
    });

  const past = festivals
    .filter((fest) => isPastFestival(fest, todayIso))
    .sort((a, b) => {
      const aKey = a.endDate ?? a.startDate ?? `${a.year}-00-00`;
      const bKey = b.endDate ?? b.startDate ?? `${b.year}-00-00`;
      return bKey.localeCompare(aKey);
    });

  const filteredCatalog = catalogQuery.trim()
    ? catalog.filter((brand) => {
        const needle = catalogQuery.trim().toLowerCase();
        return (
          brand.name.toLowerCase().includes(needle) ||
          (brand.location?.toLowerCase().includes(needle) ?? false) ||
          brand.editions.some((ed) => String(ed.year).includes(needle))
        );
      })
    : catalog;

  const renderSectionList = (items: FestivalArchiveItemDTO[], isPast: boolean) => {
    const groups = groupByFestival(items);
    return (
      <ul>
        {groups.map((group, groupIndex) => {
          if (group.editions.length === 1) {
            const fest = group.editions[0];
            if (!fest) return null;
            const isActive = fest.slug === activeFestivalSlug;
            const formattedDates = formatDateRange(fest.startDate, fest.endDate, fest.year, locale);
            return (
              <li key={fest.id} className="border-b border-line">
                <div
                  className={`flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-elevated sm:px-6 ${
                    isActive ? "border-l-4 border-l-acid bg-surface pl-4 sm:pl-5" : ""
                  } ${isPast ? "opacity-80 hover:opacity-100" : ""}`}
                >
                  <Link
                    href={festivalHomePath({ brandSlug: fest.brandSlug, year: fest.year })}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted">
                      <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formattedDates}</span>
                    </div>
                    <div className="mt-1 font-display text-[1.28rem] font-extrabold uppercase leading-tight tracking-[-0.02em] text-ink">
                      {fest.name} {fest.year}
                    </div>
                    {fest.location ? (
                      <p className="mt-0.5 font-serif text-[1.02rem] italic text-ink-muted">
                        {fest.location}
                      </p>
                    ) : null}
                  </Link>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={festivalHomePath({ brandSlug: fest.brandSlug, year: fest.year })}
                        className={
                          isActive
                            ? "border border-acid bg-acid px-2 py-0.5 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                            : "border border-line px-2 py-0.5 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink"
                        }
                      >
                        {isActive ? dict.settings.activeBadge : dict.festivals.openAction}
                      </Link>
                      <button
                        type="button"
                        disabled={togglingEditionId === fest.id}
                        onClick={() => void handleRemoveFromMine(fest.id, fest.festivalId)}
                        className="cursor-pointer border border-line px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                      >
                        {dict.catalog.removeFromMine}
                      </button>
                    </div>
                    <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                      {dict.workspace.artistsBadgeShort(fest.entriesCount)}
                    </span>
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li
              key={group.festivalId}
              className={`border-b border-line ${isPast ? "opacity-85" : ""}`}
            >
              <div className="px-5 pt-4 pb-2 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted">
                  <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                  <span aria-hidden="true">·</span>
                  <span>{dict.catalog.editionCount(group.editions.length)}</span>
                </div>
                <div className="mt-1 font-display text-[1.28rem] font-extrabold uppercase leading-tight tracking-[-0.02em] text-ink">
                  {group.name}
                </div>
                {group.location ? (
                  <p className="mt-0.5 font-serif text-[1.02rem] italic text-ink-muted">
                    {group.location}
                  </p>
                ) : null}
              </div>

              <ul className="border-t border-line bg-surface">
                {group.editions.map((ed) => {
                  const isActive = ed.slug === activeFestivalSlug;
                  const formattedDates = formatDateRange(ed.startDate, ed.endDate, ed.year, locale);
                  return (
                    <li
                      key={ed.id}
                      className={`flex items-center justify-between gap-3 border-b border-line px-5 py-2.5 last:border-b-0 sm:px-6 ${
                        isActive ? "border-l-4 border-l-acid pl-4 sm:pl-5" : ""
                      }`}
                    >
                      <Link
                        href={festivalHomePath({ brandSlug: ed.brandSlug, year: ed.year })}
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5"
                      >
                        <span className="font-mono text-sm font-semibold text-ink">{ed.year}</span>
                        {formattedDates !== String(ed.year) ? (
                          <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                            {formattedDates}
                          </span>
                        ) : null}
                        <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                          {dict.workspace.artistsBadgeShort(ed.entriesCount)}
                        </span>
                      </Link>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link
                          href={festivalHomePath({ brandSlug: ed.brandSlug, year: ed.year })}
                          className={
                            isActive
                              ? "border border-acid bg-acid px-2 py-0.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-acid-ink"
                              : "border border-line px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink"
                          }
                        >
                          {isActive ? dict.settings.activeBadge : dict.festivals.openAction}
                        </Link>
                        <button
                          type="button"
                          disabled={togglingEditionId === ed.id}
                          onClick={() => void handleRemoveFromMine(ed.id, ed.festivalId)}
                          className="cursor-pointer border border-line px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                        >
                          {dict.catalog.removeFromMine}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <main className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-6 sm:px-6">
        <div>
          <h1
            data-page-heading
            className="font-display text-[clamp(2rem,6vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]"
          >
            {dict.festivals.title}
          </h1>
          <p className="mt-2 font-serif text-[1.15rem] italic text-ink-muted">
            {dict.festivals.subtitle}
          </p>
        </div>

        <HairlineButton
          variant={panelMode !== "closed" ? "default" : "acid"}
          size="md"
          onClick={() => {
            setError(null);
            setPanelMode((prev) => (prev === "closed" ? "catalog" : "closed"));
          }}
        >
          {panelMode !== "closed" ? dict.catalog.closePanel : dict.catalog.addFestivalButton}
        </HairlineButton>
      </div>

      {/* PANEL 1: Shared Catalog Explorer */}
      {panelMode === "catalog" ? (
        <section
          aria-label={dict.catalog.catalogTitle}
          className="border-b border-line-strong bg-surface"
        >
          <div className="border-b border-line px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-ink">
                  {dict.catalog.catalogTitle}
                </h2>
                <p className="mt-1 font-serif text-[1rem] italic text-ink-muted">
                  {dict.catalog.catalogSubtitle}
                </p>
              </div>
              <HairlineButton variant="acid" size="sm" onClick={openNewFestivalForm}>
                {dict.catalog.createNewFestivalButton}
              </HairlineButton>
            </div>

            <input
              type="search"
              aria-label={dict.catalog.searchLabel}
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder={dict.catalog.searchPlaceholder}
              className="mt-3 w-full border border-line bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
            />
          </div>

          {filteredCatalog.length > 0 ? (
            <ul className="max-h-[380px] overflow-y-auto">
              {filteredCatalog.map((brand) => (
                <li
                  key={brand.id}
                  className="border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-display text-base font-extrabold uppercase tracking-[-0.02em] text-ink">
                        {brand.name}
                      </span>
                      {brand.location ? (
                        <span className="ml-2 font-serif text-[0.98rem] italic text-ink-muted">
                          {brand.location}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => openNewEditionForm(brand)}
                      className="cursor-pointer border border-line bg-bg px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      {dict.catalog.newEditionButton}
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {brand.editions.map((ed) => {
                      const isBusy = togglingEditionId === ed.id;
                      return ed.isAdded ? (
                        <span
                          key={ed.id}
                          className="inline-flex items-center gap-2 border border-acid bg-acid px-2.5 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-acid-ink"
                        >
                          <span>{ed.year}</span>
                          <span>{dict.catalog.addedBadge}</span>
                        </span>
                      ) : (
                        <button
                          key={ed.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAddFromCatalog(ed)}
                          className="inline-flex cursor-pointer items-center gap-2 border border-line bg-bg px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink transition-colors hover:border-acid hover:bg-acid hover:font-semibold hover:text-acid-ink disabled:opacity-50"
                        >
                          <span>{ed.year}</span>
                          <span className="text-[0.62rem] opacity-75">
                            {dict.workspace.artistsBadgeShort(ed.entriesCount)}
                          </span>
                          <span>{dict.catalog.addEditionAction}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
              <p className="font-serif text-[1.02rem] italic text-ink-muted">
                {dict.catalog.notFoundPrompt}
              </p>
              <HairlineButton variant="acid" size="sm" onClick={openNewFestivalForm}>
                {dict.catalog.createNewFestivalButton}
              </HairlineButton>
            </div>
          )}
        </section>
      ) : null}

      {/* PANEL 2: Create New Festival or New Edition */}
      {panelMode === "create-festival" || panelMode === "create-edition" ? (
        <section
          aria-label={dict.importer.createFestivalAria}
          className="border-b border-line-strong bg-surface px-5 py-5 sm:px-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-mono text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-ink">
              {panelMode === "create-edition" && targetBrand
                ? dict.catalog.createEditionTitle(targetBrand.name)
                : dict.festivals.createSubmit}
            </h2>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPanelMode("catalog");
              }}
              className="cursor-pointer font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              {dict.catalog.backToCatalog}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {panelMode === "create-festival" ? (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-name`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.nameLabel}
                </label>
                <input
                  id={`${formId}-name`}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={dict.importer.namePlaceholder}
                  className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
                />
              </div>
            ) : null}

            <div
              className={`flex flex-col gap-1 ${panelMode === "create-edition" ? "sm:col-span-2" : ""}`}
            >
              <label
                htmlFor={`${formId}-location`}
                className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
              >
                {dict.importer.locationLabel}
              </label>
              <PlaceAutocomplete
                id={`${formId}-location`}
                value={locationQuery}
                selectedPlace={selectedPlace}
                invalid={locationInvalid}
                onInputChange={(nextValue) => {
                  setLocationQuery(nextValue);
                  setLocationInvalid(false);
                }}
                onSelectPlace={(place) => {
                  setSelectedPlace(place);
                  setLocationInvalid(false);
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-start`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.startDateLabel}
                </label>
                <input
                  id={`${formId}-start`}
                  type="date"
                  value={startDate}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-end`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.endDateLabel}
                </label>
                <input
                  id={`${formId}-end`}
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${formId}-year`}
                  className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                >
                  {dict.importer.yearLabel}
                </label>
                <input
                  id={`${formId}-year`}
                  type="number"
                  min={1950}
                  max={2100}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none"
                />
              </div>
            </div>

            {isAdmin ? (
              <>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${formId}-lineup-url`}
                    className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.manage.autoSync.sourceUrlOptionalLabel}
                  </label>
                  <input
                    id={`${formId}-lineup-url`}
                    type="url"
                    value={lineupSourceUrl}
                    onChange={(event) => setLineupSourceUrl(event.target.value)}
                    placeholder={dict.manage.autoSync.sourceUrlPlaceholder}
                    className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${formId}-sync-schedule`}
                    className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
                  >
                    {dict.manage.autoSync.intervalLabel}
                  </label>
                  <select
                    id={`${formId}-sync-schedule`}
                    value={syncSchedule}
                    disabled={lineupSourceUrl.trim().length === 0}
                    onChange={(event) =>
                      setSyncSchedule(event.target.value as "once" | "12" | "24" | "168")
                    }
                    className="border border-line bg-bg px-3 py-2 font-mono text-xs text-ink focus:border-ink focus:outline-none disabled:opacity-50"
                  >
                    <option value="once">{dict.manage.autoSync.intervalOnce}</option>
                    <option value="12">{dict.manage.autoSync.intervalHours(12)}</option>
                    <option value="24">{dict.manage.autoSync.intervalDays(1)}</option>
                    <option value="168">{dict.manage.autoSync.intervalWeek}</option>
                  </select>
                </div>
              </>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 border border-line-strong bg-bg px-3 py-2 font-mono text-xs text-ink"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <HairlineButton
              variant="acid"
              size="md"
              disabled={creating || (panelMode === "create-festival" && name.trim().length === 0)}
              onClick={() => void handleCreateSubmit()}
            >
              {creating
                ? lineupSourceUrl.trim().length > 0
                  ? dict.manage.autoSync.creatingAndImporting
                  : dict.importer.creating
                : panelMode === "create-edition"
                  ? dict.catalog.createEditionSubmit
                  : dict.festivals.createSubmit}
            </HairlineButton>
          </div>
        </section>
      ) : null}

      {error && panelMode === "closed" ? (
        <div
          role="alert"
          className="border-b border-line-strong bg-surface px-5 py-3 font-mono text-xs text-ink sm:px-6"
        >
          {error}
        </div>
      ) : null}

      {createNotice ? (
        <div
          role="status"
          className="border-b border-acid bg-surface px-5 py-3 font-mono text-xs text-ink sm:px-6"
        >
          {createNotice}
        </div>
      ) : null}

      {festivals.length === 0 ? (
        <EmptyState
          title={dict.festivals.emptyTitle}
          description={dict.festivals.emptyDescription}
        />
      ) : (
        <div className="grid grid-cols-1 tablet-h:grid-cols-2">
          <section
            aria-labelledby="festivals-upcoming-heading"
            className="tablet-h:border-r tablet-h:border-line"
          >
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
              <h2 id="festivals-upcoming-heading" className="font-semibold text-ink">
                {dict.festivals.upcomingTitle}
              </h2>
              <span className="text-ink-muted">{upcoming.length}</span>
            </div>
            {upcoming.length > 0 ? (
              renderSectionList(upcoming, false)
            ) : (
              <p className="border-b border-line px-5 py-5 font-serif text-[1.02rem] italic text-ink-muted sm:px-6">
                {dict.festivals.emptyUpcoming}
              </p>
            )}
          </section>

          <section aria-labelledby="festivals-past-heading">
            <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] sm:px-6">
              <h2 id="festivals-past-heading" className="font-semibold text-ink-muted">
                {dict.festivals.pastTitle}
              </h2>
              <span className="text-ink-muted">{past.length}</span>
            </div>
            {past.length > 0 ? (
              renderSectionList(past, true)
            ) : (
              <p className="border-b border-line px-5 py-5 font-serif text-[1.02rem] italic text-ink-muted sm:px-6">
                {dict.festivals.emptyPast}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
