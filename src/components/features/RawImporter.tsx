"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { createFestivalAction } from "@/actions/festival-actions";
import { importLineupAction } from "@/actions/import-actions";
import { PlaceAutocomplete } from "@/components/features/PlaceAutocomplete";
import type { FestivalSummary } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { parseRawLineup } from "@/domain/lineup-parser";
import type { PlaceCandidate } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface RawImporterProps {
  festivals: FestivalSummary[];
  initialFestivalId: string | null;
}

interface EditableRow {
  key: string;
  included: boolean;
  billingName: string;
  artistsCsv: string;
  subtitle: string;
  day: string;
  stage: string;
  setTime: string;
}

export function RawImporter({ festivals: initialFestivals, initialFestivalId }: RawImporterProps) {
  const { dict } = useI18n();
  const formId = useId();
  const [festivals, setFestivals] = useState<FestivalSummary[]>(initialFestivals);
  const [selectedFestivalId, setSelectedFestivalId] = useState<string>(
    initialFestivalId ?? initialFestivals[0]?.id ?? "",
  );
  const [showNewFestival, setShowNewFestival] = useState(initialFestivals.length === 0);
  const [newFestName, setNewFestName] = useState("");
  const [newFestYear, setNewFestYear] = useState(String(new Date().getFullYear()));
  const [newFestLocationQuery, setNewFestLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceCandidate | null>(null);
  const [locationInvalid, setLocationInvalid] = useState(false);
  const [newFestStartDate, setNewFestStartDate] = useState("");
  const [newFestEndDate, setNewFestEndDate] = useState("");
  const [creatingFestival, setCreatingFestival] = useState(false);

  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [showScheduleColumns, setShowScheduleColumns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<{
    createdEntriesCount: number;
    newArtistsCount: number;
    festivalSlug: string;
  } | null>(null);

  const handleStartDateChange = (nextStartDate: string) => {
    setNewFestStartDate(nextStartDate);
    const yearMatch = nextStartDate.match(/^(\d{4})-/);
    if (yearMatch?.[1]) {
      setNewFestYear(yearMatch[1]);
    }
    if (newFestEndDate && nextStartDate && newFestEndDate < nextStartDate) {
      setNewFestEndDate("");
    }
  };

  const handleCreateFestival = async () => {
    setError(null);

    if (newFestLocationQuery.trim().length > 0 && !selectedPlace) {
      setLocationInvalid(true);
      setError(dict.importer.locationInvalidError);
      return;
    }

    if (newFestStartDate && newFestEndDate && newFestEndDate < newFestStartDate) {
      setError(dict.importer.dateOrderError);
      return;
    }

    setCreatingFestival(true);
    try {
      const res = await createFestivalAction({
        name: newFestName,
        year: Number(newFestYear),
        location: selectedPlace ? selectedPlace.name : undefined,
        locationProvince: selectedPlace?.province ?? null,
        locationRegion: selectedPlace?.region ?? null,
        locationCountry: selectedPlace?.country ?? null,
        locationCountryCode: selectedPlace?.countryCode ?? null,
        locationLatitude: selectedPlace?.latitude ?? null,
        locationLongitude: selectedPlace?.longitude ?? null,
        locationPlaceId: selectedPlace?.placeId ?? null,
        startDate: newFestStartDate ? new Date(`${newFestStartDate}T00:00:00.000Z`) : undefined,
        endDate: newFestEndDate ? new Date(`${newFestEndDate}T00:00:00.000Z`) : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFestivals((prev) => [res.data, ...prev]);
      setSelectedFestivalId(res.data.id);
      setShowNewFestival(false);
      setNewFestName("");
      setNewFestLocationQuery("");
      setSelectedPlace(null);
      setLocationInvalid(false);
      setNewFestStartDate("");
      setNewFestEndDate("");
    } finally {
      setCreatingFestival(false);
    }
  };

  const handleParse = () => {
    setError(null);
    setResultSummary(null);
    const parsed = parseRawLineup(rawText);
    setRows(
      parsed.map((item, idx) => ({
        key: `${idx}-${item.billingName}`,
        included: true,
        billingName: item.billingName,
        artistsCsv: item.artistNames.join(", "),
        subtitle: item.subtitle ?? "",
        day: item.day ?? "",
        stage: item.stage ?? "",
        setTime: item.setTime ?? "",
      })),
    );
  };

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const handleConfirmImport = async () => {
    if (!selectedFestivalId) {
      setError(dict.importer.selectFestivalError);
      return;
    }

    const includedRows = rows
      .filter((row) => row.included && row.billingName.trim().length > 0)
      .map((row) => ({
        billingName: row.billingName.trim(),
        artistNames: row.artistsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        subtitle: row.subtitle.trim() || null,
        day: showScheduleColumns ? row.day.trim() || null : null,
        stage: showScheduleColumns ? row.stage.trim() || null : null,
        setTime: showScheduleColumns ? row.setTime.trim() || null : null,
        included: true,
      }))
      .filter((row) => row.artistNames.length > 0);

    if (includedRows.length === 0) {
      setError(dict.importer.noValidRowsError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await importLineupAction({
        festivalId: selectedFestivalId,
        rows: includedRows,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const targetFest = festivals.find((f) => f.id === selectedFestivalId);
      setResultSummary({
        createdEntriesCount: res.data.createdEntriesCount,
        newArtistsCount: res.data.newArtistsCount,
        festivalSlug: targetFest?.slug ?? "",
      });
      setRows([]);
      setRawText("");
      setShowScheduleColumns(false);
    } finally {
      setSubmitting(false);
    }
  };

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <main className="mx-auto flex max-w-[1160px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
            {dict.importer.title}
          </h1>
          <p className="mt-2 font-serif text-[1.25rem] italic text-ink-muted">
            {dict.importer.subtitle}
          </p>
        </div>

        <div className="flex items-stretch border border-line">
          {festivals.length > 0 ? (
            <select
              aria-label={dict.importer.targetFestivalAria}
              value={selectedFestivalId}
              onChange={(event) => setSelectedFestivalId(event.target.value)}
              className="cursor-pointer bg-bg px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-ink outline-none"
            >
              {festivals.map((fest) => (
                <option key={fest.id} value={fest.id} className="bg-bg text-ink">
                  {fest.name} {fest.year}
                </option>
              ))}
            </select>
          ) : null}
          <HairlineButton
            type="button"
            variant={showNewFestival ? "inverted" : "default"}
            size="md"
            onClick={() => setShowNewFestival((prev) => !prev)}
            className="border-0 border-l border-line"
          >
            {dict.importer.newFestivalButton}
          </HairlineButton>
        </div>
      </div>

      {showNewFestival ? (
        <form
          aria-label={dict.importer.createFestivalAria}
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateFestival();
          }}
          className="grid grid-cols-1 gap-4 border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_100px_2fr_1fr_1fr_auto] lg:items-end"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-name`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.importer.nameLabel}
            </label>
            <input
              id={`${formId}-name`}
              name="name"
              type="text"
              required
              value={newFestName}
              onChange={(event) => setNewFestName(event.target.value)}
              placeholder={dict.importer.namePlaceholder}
              className="border border-line bg-bg px-3 py-2 font-sans text-sm text-ink outline-none focus-visible:border-acid"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-year`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.importer.yearLabel}
            </label>
            <input
              id={`${formId}-year`}
              name="year"
              type="number"
              min={1950}
              max={2100}
              required
              value={newFestYear}
              onChange={(event) => setNewFestYear(event.target.value)}
              placeholder="2027"
              className="border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-acid"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-location`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.importer.locationLabel}
            </label>
            <PlaceAutocomplete
              id={`${formId}-location`}
              value={newFestLocationQuery}
              selectedPlace={selectedPlace}
              onInputChange={(next) => {
                setNewFestLocationQuery(next);
                if (locationInvalid) {
                  setLocationInvalid(false);
                }
              }}
              onSelectPlace={(place) => {
                setSelectedPlace(place);
                setLocationInvalid(false);
              }}
              invalid={locationInvalid}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-start-date`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.importer.startDateLabel}
            </label>
            <input
              id={`${formId}-start-date`}
              name="startDate"
              type="date"
              value={newFestStartDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
              className="border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-acid"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-end-date`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted"
            >
              {dict.importer.endDateLabel}
            </label>
            <input
              id={`${formId}-end-date`}
              name="endDate"
              type="date"
              min={newFestStartDate || undefined}
              value={newFestEndDate}
              onChange={(event) => setNewFestEndDate(event.target.value)}
              className="border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-acid"
            />
          </div>

          <HairlineButton type="submit" variant="acid" size="md" disabled={creatingFestival}>
            {creatingFestival ? dict.importer.creating : dict.importer.create}
          </HairlineButton>
        </form>
      ) : null}

      <section className="flex flex-col gap-3">
        <label
          htmlFor={`${formId}-raw-lineup`}
          className="font-mono text-[0.72rem] uppercase tracking-[0.06em] text-ink-muted"
        >
          {dict.importer.rawLineupLabel}
        </label>
        <textarea
          id={`${formId}-raw-lineup`}
          name="rawLineup"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={
            "Tim Hecker & Vincent de Belleval\nWilliam Basinski 'Passing the Cup of Sorrows'\nBIG|BRAVE · Mabe Fratti & Bill Orcutt · Sarah Davachi 'The Will of Tongues'"
          }
          className="min-h-[190px] w-full resize-y border border-line bg-surface p-4 font-mono text-[0.82rem] leading-relaxed text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-3">
          <HairlineButton
            type="button"
            variant="acid"
            size="md"
            disabled={rawText.trim().length === 0}
            onClick={handleParse}
          >
            {dict.importer.analyzeButton}
          </HairlineButton>
          {rows.length > 0 ? (
            <span className="font-mono text-xs uppercase text-ink-muted">
              {dict.importer.rowsReady(includedCount, rows.length)}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div role="alert" className="border border-line bg-surface p-3 font-mono text-xs text-ink">
          {error}
        </div>
      ) : null}

      {resultSummary ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-4 border border-acid bg-surface p-4"
        >
          <div className="font-mono text-xs uppercase">
            {dict.importer.importedSummary(
              resultSummary.createdEntriesCount,
              resultSummary.newArtistsCount,
            )}
          </div>
          <Link
            href={
              resultSummary.festivalSlug
                ? `/?festival=${encodeURIComponent(resultSummary.festivalSlug)}`
                : "/"
            }
            className="border border-acid bg-acid px-4 py-2 font-mono text-xs font-semibold uppercase text-acid-ink"
          >
            {dict.importer.viewLineup}
          </Link>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor={`${formId}-schedule-toggle`}
              className="inline-flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.05em] text-ink-muted hover:text-ink"
            >
              <input
                id={`${formId}-schedule-toggle`}
                type="checkbox"
                checked={showScheduleColumns}
                onChange={(event) => setShowScheduleColumns(event.target.checked)}
                className="h-4 w-4 cursor-pointer accent-acid"
              />
              <span>{dict.importer.scheduleToggle}</span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="font-mono text-[0.72rem] uppercase text-ink-muted">
                  <th className="w-10 border border-line p-2.5 text-center">
                    {dict.importer.colInclude}
                  </th>
                  <th className="border border-line p-2.5 text-left">
                    {dict.importer.colBillingName}
                  </th>
                  <th className="border border-line p-2.5 text-left">{dict.importer.colArtists}</th>
                  <th className="border border-line p-2.5 text-left">
                    {dict.importer.colSubtitle}
                  </th>
                  {showScheduleColumns ? (
                    <>
                      <th className="border border-line p-2.5 text-left">{dict.importer.colDay}</th>
                      <th className="border border-line p-2.5 text-left">
                        {dict.importer.colStage}
                      </th>
                      <th className="border border-line p-2.5 text-left">
                        {dict.importer.colTime}
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key} className={row.included ? "" : "opacity-40"}>
                    <td className="border border-line p-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.included}
                        aria-label={dict.importer.includeAria(row.billingName)}
                        onChange={(event) => updateRow(idx, { included: event.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-acid"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        aria-label={dict.importer.billingNameRowAria(idx + 1)}
                        value={row.billingName}
                        onChange={(event) => updateRow(idx, { billingName: event.target.value })}
                        className="w-full bg-transparent px-1.5 py-1 font-sans font-semibold text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        aria-label={dict.importer.artistsRowAria(idx + 1)}
                        value={row.artistsCsv}
                        onChange={(event) => updateRow(idx, { artistsCsv: event.target.value })}
                        className="w-full bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    <td className="border border-line p-1.5">
                      <input
                        type="text"
                        aria-label={dict.importer.subtitleRowAria(idx + 1)}
                        value={row.subtitle}
                        onChange={(event) => updateRow(idx, { subtitle: event.target.value })}
                        placeholder="—"
                        className="w-full bg-transparent px-1.5 py-1 font-serif text-base italic text-ink outline-none focus:bg-surface"
                      />
                    </td>
                    {showScheduleColumns ? (
                      <>
                        <td className="border border-line p-1.5">
                          <input
                            type="text"
                            aria-label={dict.importer.dayRowAria(idx + 1)}
                            value={row.day}
                            onChange={(event) => updateRow(idx, { day: event.target.value })}
                            placeholder="—"
                            className="w-28 bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                          />
                        </td>
                        <td className="border border-line p-1.5">
                          <input
                            type="text"
                            aria-label={dict.importer.stageRowAria(idx + 1)}
                            value={row.stage}
                            onChange={(event) => updateRow(idx, { stage: event.target.value })}
                            placeholder="—"
                            className="w-28 bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                          />
                        </td>
                        <td className="border border-line p-1.5">
                          <input
                            type="text"
                            aria-label={dict.importer.timeRowAria(idx + 1)}
                            value={row.setTime}
                            onChange={(event) => updateRow(idx, { setTime: event.target.value })}
                            placeholder="—"
                            className="w-20 bg-transparent px-1.5 py-1 font-mono text-xs text-ink outline-none focus:bg-surface"
                          />
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <HairlineButton
              type="button"
              variant="acid"
              size="md"
              disabled={submitting || includedCount === 0}
              onClick={() => void handleConfirmImport()}
            >
              {submitting ? dict.importer.importing : dict.importer.importEntries(includedCount)}
            </HairlineButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
