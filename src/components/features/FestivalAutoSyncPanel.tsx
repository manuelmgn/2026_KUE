"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  applyPendingLineupDiffAction,
  checkFestivalLineupAction,
  dismissPendingLineupDiffAction,
  updateFestivalSyncConfigAction,
} from "@/actions/festival-actions";
import type { FestivalEditDTO } from "@/components/features/types";
import { HairlineButton } from "@/components/ui/HairlineButton";
import type { PendingLineupDiff } from "@/domain/lineup-diff";
import type { LineupSyncMode } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FestivalAutoSyncPanelProps {
  festival: FestivalEditDTO;
  hasGeminiApiKey: boolean;
}

function normalizeIntervalOption(hours: number): "12" | "24" | "168" {
  if (hours <= 12) return "12";
  if (hours <= 24) return "24";
  return "168";
}

export function FestivalAutoSyncPanel({ festival, hasGeminiApiKey }: FestivalAutoSyncPanelProps) {
  const { dict, locale } = useI18n();
  const router = useRouter();
  const formId = useId();
  const t = dict.manage.autoSync;

  const [sourceUrl, setSourceUrl] = useState(festival.lineupSourceUrl ?? "");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(festival.autoSyncEnabled);
  const [autoSyncMode, setAutoSyncMode] = useState<LineupSyncMode>(festival.autoSyncMode);
  const [syncIntervalHours, setSyncIntervalHours] = useState(festival.syncIntervalHours);
  const [pendingDiff, setPendingDiff] = useState<PendingLineupDiff | null>(
    festival.pendingLineupDiff,
  );
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(festival.lastLineupSyncAt);
  const [lastError, setLastError] = useState<string | null>(festival.lastLineupSyncError);

  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedAdded, setSelectedAdded] = useState<Set<number>>(
    () => new Set((festival.pendingLineupDiff?.added ?? []).map((_, idx) => idx)),
  );
  const [selectedUpdated, setSelectedUpdated] = useState<Set<string>>(
    () => new Set((festival.pendingLineupDiff?.updated ?? []).map((item) => item.entryId)),
  );

  useEffect(() => {
    setPendingDiff(festival.pendingLineupDiff);
    setLastCheckAt(festival.lastLineupSyncAt);
    setLastError(festival.lastLineupSyncError);
    setSelectedAdded(new Set((festival.pendingLineupDiff?.added ?? []).map((_, idx) => idx)));
    setSelectedUpdated(
      new Set((festival.pendingLineupDiff?.updated ?? []).map((item) => item.entryId)),
    );
  }, [festival.pendingLineupDiff, festival.lastLineupSyncAt, festival.lastLineupSyncError]);

  const handleSaveConfig = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setConfigSaved(false);
    setSavingConfig(true);
    try {
      const res = await updateFestivalSyncConfigAction({
        festivalId: festival.id,
        lineupSourceUrl: sourceUrl.trim() || null,
        autoSyncEnabled: sourceUrl.trim().length > 0 ? autoSyncEnabled : false,
        autoSyncMode,
        syncIntervalHours,
      });
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setConfigSaved(true);
      router.refresh();
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCheckNow = async (force = false) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setConfigSaved(false);
    setChecking(true);

    try {
      // Save unsaved config changes before checking so the URL & mode are up to date
      const saveRes = await updateFestivalSyncConfigAction({
        festivalId: festival.id,
        lineupSourceUrl: sourceUrl.trim() || null,
        autoSyncEnabled: sourceUrl.trim().length > 0 ? autoSyncEnabled : false,
        autoSyncMode,
        syncIntervalHours,
      });
      if (!saveRes.ok) {
        setErrorMessage(saveRes.error);
        return;
      }

      const res = await checkFestivalLineupAction(festival.id, force);
      if (!res.ok) {
        setErrorMessage(res.error);
        setLastError(res.error);
        setLastCheckAt(new Date().toISOString());
        return;
      }

      setLastError(null);
      setLastCheckAt(new Date().toISOString());
      setPendingDiff(res.data.pendingDiff);
      setSelectedAdded(new Set((res.data.pendingDiff?.added ?? []).map((_, idx) => idx)));
      setSelectedUpdated(
        new Set((res.data.pendingDiff?.updated ?? []).map((item) => item.entryId)),
      );

      if (res.data.status === "unchanged") {
        setStatusMessage(t.statusUnchanged);
      } else if (res.data.status === "up_to_date") {
        setStatusMessage(t.statusUpToDate);
      } else if (res.data.status === "applied") {
        setStatusMessage(
          t.statusApplied(res.data.addedCount, res.data.updatedCount, res.data.newArtistsCount),
        );
      } else {
        setStatusMessage(
          t.statusPendingReview(res.data.addedCount, res.data.updatedCount, res.data.missingCount),
        );
      }

      router.refresh();
    } finally {
      setChecking(false);
    }
  };

  const handleApplyDiff = async () => {
    if (!pendingDiff) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setApplying(true);

    try {
      const res = await applyPendingLineupDiffAction({
        festivalId: festival.id,
        addedIndexes: Array.from(selectedAdded),
        updatedEntryIds: Array.from(selectedUpdated),
      });
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setPendingDiff(null);
      setStatusMessage(
        t.appliedSummary(
          res.data.createdEntriesCount,
          res.data.updatedEntriesCount,
          res.data.newArtistsCount,
        ),
      );
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  const handleDismissDiff = async () => {
    setErrorMessage(null);
    setApplying(true);
    try {
      const res = await dismissPendingLineupDiffAction(festival.id);
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setPendingDiff(null);
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  const toggleAdded = (idx: number) => {
    setSelectedAdded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const toggleUpdated = (entryId: string) => {
    setSelectedUpdated((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const selectedChangesCount = selectedAdded.size + selectedUpdated.size;

  const formattedLastCheck = lastCheckAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(lastCheckAt))
    : t.neverChecked;

  return (
    <section className="flex flex-col gap-6 px-5 py-6 sm:px-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink">
            {t.title}
          </h2>
          <span
            className={`border px-2 py-0.5 font-mono text-[0.66rem] uppercase tracking-[0.06em] ${
              hasGeminiApiKey
                ? "border-acid bg-acid font-semibold text-acid-ink"
                : "border-line text-ink-muted"
            }`}
          >
            {hasGeminiApiKey ? t.geminiActive : t.geminiMissing}
          </span>
        </div>
        <p className="mt-1 font-serif text-[1.05rem] italic text-ink-muted">{t.description}</p>
      </div>

      {/* Config form */}
      <div className="flex flex-col gap-4 border border-line bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${formId}-source-url`}
            className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
          >
            {t.sourceUrlLabel}
          </label>
          <input
            id={`${formId}-source-url`}
            type="url"
            value={sourceUrl}
            onChange={(event) => {
              setSourceUrl(event.target.value);
              setConfigSaved(false);
            }}
            placeholder={t.sourceUrlPlaceholder}
            className="border border-line bg-bg px-3 py-2 font-mono text-[0.82rem] text-ink placeholder:text-ink-muted focus:border-ink focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${formId}-interval`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
            >
              {t.intervalLabel}
            </label>
            <select
              id={`${formId}-interval`}
              value={autoSyncEnabled ? normalizeIntervalOption(syncIntervalHours) : "once"}
              disabled={sourceUrl.trim().length === 0}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "once") {
                  setAutoSyncEnabled(false);
                } else {
                  setAutoSyncEnabled(true);
                  setSyncIntervalHours(Number(value));
                }
                setConfigSaved(false);
              }}
              className="border border-line bg-bg px-3 py-2 font-mono text-[0.8rem] text-ink focus:border-ink focus:outline-none disabled:opacity-50"
            >
              <option value="once">{t.intervalOnce}</option>
              <option value="12">{t.intervalHours(12)}</option>
              <option value="24">{t.intervalDays(1)}</option>
              <option value="168">{t.intervalWeek}</option>
            </select>
            <span className="font-serif text-[0.88rem] italic text-ink-muted">{t.enabledHint}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${formId}-mode`}
              className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted"
            >
              {t.modeLabel}
            </label>
            <select
              id={`${formId}-mode`}
              value={autoSyncMode}
              onChange={(event) => {
                setAutoSyncMode(event.target.value as LineupSyncMode);
                setConfigSaved(false);
              }}
              className="border border-line bg-bg px-3 py-2 font-mono text-[0.8rem] text-ink focus:border-ink focus:outline-none"
            >
              <option value="REVIEW">{t.modeReview}</option>
              <option value="AUTO">{t.modeAuto}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink-muted">
            {t.lastCheckLabel} <strong className="text-ink">{formattedLastCheck}</strong>
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <HairlineButton
              variant="default"
              size="sm"
              disabled={savingConfig || checking}
              onClick={() => void handleSaveConfig()}
            >
              {savingConfig ? dict.common.saving : t.saveConfig}
            </HairlineButton>

            <HairlineButton
              variant="acid"
              size="sm"
              disabled={checking || savingConfig || sourceUrl.trim().length === 0}
              onClick={() => void handleCheckNow(false)}
            >
              {checking ? t.checking : t.checkNow}
            </HairlineButton>

            {lastCheckAt ? (
              <HairlineButton
                variant="ghost"
                size="sm"
                disabled={checking || savingConfig || sourceUrl.trim().length === 0}
                onClick={() => void handleCheckNow(true)}
              >
                {t.forceCheck}
              </HairlineButton>
            ) : null}
          </div>
        </div>
      </div>

      {configSaved ? (
        <p
          role="status"
          className="border border-acid bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
        >
          {t.configSaved}
        </p>
      ) : null}

      {statusMessage ? (
        <p
          role="status"
          className="border border-acid bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
        >
          {statusMessage}
        </p>
      ) : null}

      {errorMessage || lastError ? (
        <p
          role="alert"
          className="border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
        >
          {errorMessage ?? lastError}
        </p>
      ) : null}

      {/* Pending diff review inbox */}
      {pendingDiff &&
      (pendingDiff.added.length > 0 ||
        pendingDiff.updated.length > 0 ||
        pendingDiff.missing.length > 0) ? (
        <div className="flex flex-col gap-4 border border-acid bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h3 className="font-mono text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-ink">
                {t.pendingTitle}
              </h3>
              <p className="mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                {pendingDiff.method} ·{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(pendingDiff.checkedAt))}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <HairlineButton
                variant="ghost"
                size="sm"
                disabled={applying}
                onClick={() => void handleDismissDiff()}
              >
                {t.dismissPending}
              </HairlineButton>
              {pendingDiff.added.length > 0 || pendingDiff.updated.length > 0 ? (
                <HairlineButton
                  variant="acid"
                  size="sm"
                  disabled={applying || selectedChangesCount === 0}
                  onClick={() => void handleApplyDiff()}
                >
                  {applying ? t.applying : t.applySelected(selectedChangesCount)}
                </HairlineButton>
              ) : null}
            </div>
          </div>

          {pendingDiff.added.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h4 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
                {t.pendingAddedTitle(pendingDiff.added.length)}
              </h4>
              <ul className="divide-y divide-line border border-line bg-bg">
                {pendingDiff.added.map((entry, idx) => (
                  <li
                    key={`${entry.billingName}|${entry.day ?? ""}|${entry.stage ?? ""}|${entry.setTime ?? ""}`}
                    className="flex items-start gap-3 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdded.has(idx)}
                      onChange={() => toggleAdded(idx)}
                      aria-label={dict.importer.includeAria(entry.billingName)}
                      className="mt-1 accent-acid"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[0.95rem] font-semibold text-ink">
                        {entry.billingName}
                      </p>
                      <p className="font-mono text-[0.7rem] text-ink-muted">
                        {[
                          entry.artistNames.join(", "),
                          entry.subtitle,
                          entry.day,
                          entry.stage,
                          entry.setTime,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pendingDiff.updated.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h4 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
                {t.pendingUpdatedTitle(pendingDiff.updated.length)}
              </h4>
              <ul className="divide-y divide-line border border-line bg-bg">
                {pendingDiff.updated.map((item) => (
                  <li key={item.entryId} className="flex items-start gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedUpdated.has(item.entryId)}
                      onChange={() => toggleUpdated(item.entryId)}
                      aria-label={dict.importer.includeAria(item.billingName)}
                      className="mt-1 accent-acid"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[0.95rem] font-semibold text-ink">
                        {item.billingName}
                      </p>
                      <p className="font-mono text-[0.7rem] text-ink-muted">
                        {[
                          item.changes.subtitle && `+ ${item.changes.subtitle}`,
                          item.changes.day && `+ ${item.changes.day}`,
                          item.changes.stage && `+ ${item.changes.stage}`,
                          item.changes.setTime && `+ ${item.changes.setTime}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pendingDiff.missing.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                {t.pendingMissingTitle(pendingDiff.missing.length)}
              </h4>
              <p className="font-serif text-[0.9rem] italic text-ink-muted">
                {t.pendingMissingHint}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {pendingDiff.missing.map((item) => (
                  <span
                    key={item.entryId}
                    className="border border-line bg-bg px-2 py-0.5 font-mono text-[0.7rem] text-ink-muted"
                  >
                    {item.billingName}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
