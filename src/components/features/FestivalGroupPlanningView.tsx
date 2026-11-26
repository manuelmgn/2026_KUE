"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { addEditionToMyFestivalsAction } from "@/actions/festival-actions";
import {
  createFestivalComparisonAction,
  createJointAgendaAction,
  deleteFestivalComparisonAction,
  deleteJointAgendaAction,
  getFestivalComparisonAction,
  getJointAgendaAction,
  getSavedFestivalComparisonAction,
  leaveJointAgendaAction,
  regenerateJointAgendaAction,
  setJointAgendaEntryAction,
} from "@/actions/group-planning-actions";
import { FestivalHeaderNav } from "@/components/features/FestivalHeaderNav";
import type { FestivalSummary } from "@/components/features/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { festivalCartelPath } from "@/domain/festival-routes";
import {
  type CoincidingFriendDTO,
  type ComparisonEntryRowDTO,
  type EntryConsensusTag,
  FESTIVAL_RECOMMENDATION_THRESHOLD,
  type FestivalComparisonTableDTO,
  type JointAgendaDetailDTO,
  type JointAgendaItemDTO,
  type JointAgendaSummaryDTO,
  type SavedFestivalComparisonSummaryDTO,
} from "@/domain/group-planning";
import type { ComparisonSortMode, JointAgendaStrategy } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface FestivalGroupPlanningViewProps {
  currentUserId: string;
  festival: FestivalSummary;
  isInMyFestivals: boolean;
  coincidingFriends: CoincidingFriendDTO[];
  initialComparison: FestivalComparisonTableDTO | null;
  initialSavedComparisons: SavedFestivalComparisonSummaryDTO[];
  initialAgendas: JointAgendaSummaryDTO[];
  initialAgendaDetail: JointAgendaDetailDTO | null;
  initialTab?: "comparison" | "agenda";
}

type ConsensusFilter = "ALL" | "UNANIMOUS_MUST_SEE" | "RECOMMENDED" | "DIVISIVE";

const ALL_DAYS_KEY = "__ALL__";

export function FestivalGroupPlanningView({
  currentUserId,
  festival,
  isInMyFestivals,
  coincidingFriends,
  initialComparison,
  initialSavedComparisons,
  initialAgendas,
  initialAgendaDetail,
  initialTab = "comparison",
}: FestivalGroupPlanningViewProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const formId = useId();
  const gp = dict.groupPlanning;

  const [inMyFestivals, setInMyFestivals] = useState(isInMyFestivals);
  const [addingEdition, setAddingEdition] = useState(false);

  const [activeTab, setActiveTab] = useState<"comparison" | "agenda">(initialTab);
  const [error, setError] = useState<string | null>(null);

  // Comparison state
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(() =>
    coincidingFriends.map((f) => f.id),
  );
  const [savedComparisons, setSavedComparisons] =
    useState<SavedFestivalComparisonSummaryDTO[]>(initialSavedComparisons);
  const [activeComparisonId, setActiveComparisonId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<FestivalComparisonTableDTO | null>(
    initialComparison,
  );
  const [loadingComparison, setLoadingComparison] = useState(false);

  const [sortBy, setSortBy] = useState<ComparisonSortMode>(initialComparison?.sortBy ?? "AVG_DESC");
  const [onlyRated, setOnlyRated] = useState(false);
  const [consensusFilter, setConsensusFilter] = useState<ConsensusFilter>("ALL");

  const [showSaveComparisonForm, setShowSaveComparisonForm] = useState(false);
  const [comparisonNameDraft, setComparisonNameDraft] = useState("");
  const [savingComparison, setSavingComparison] = useState(false);

  // Joint Agenda state
  const [agendas, setAgendas] = useState<JointAgendaSummaryDTO[]>(initialAgendas);
  const [activeAgenda, setActiveAgenda] = useState<JointAgendaDetailDTO | null>(
    initialAgendaDetail,
  );
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const [showCreateAgendaForm, setShowCreateAgendaForm] = useState(false);
  const [agendaNameDraft, setAgendaNameDraft] = useState("");
  const [agendaStrategy, setAgendaStrategy] = useState<JointAgendaStrategy>("RECOMMENDED");
  const [agendaThreshold, setAgendaThreshold] = useState(String(FESTIVAL_RECOMMENDATION_THRESHOLD));
  const [creatingAgenda, setCreatingAgenda] = useState(false);

  const [showRegeneratePanel, setShowRegeneratePanel] = useState(false);
  const [regenStrategy, setRegenStrategy] = useState<JointAgendaStrategy>("RECOMMENDED");
  const [regenThreshold, setRegenThreshold] = useState(String(FESTIVAL_RECOMMENDATION_THRESHOLD));
  const [preserveManual, setPreserveManual] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const [selectedDay, setSelectedDay] = useState<string>(ALL_DAYS_KEY);
  const [addEntryId, setAddEntryId] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingNoteEntryId, setEditingNoteEntryId] = useState<string | null>(null);
  const [confirmDeleteAgenda, setConfirmDeleteAgenda] = useState(false);

  useEffect(() => {
    setInMyFestivals(isInMyFestivals);
  }, [isInMyFestivals]);

  const activeAgendaEntryIds = useMemo(
    () => new Set(activeAgenda?.items.map((item) => item.entryId) ?? []),
    [activeAgenda],
  );

  const handleAddFestivalEdition = async () => {
    setError(null);
    setAddingEdition(true);
    try {
      const res = await addEditionToMyFestivalsAction(festival.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInMyFestivals(true);
      router.refresh();
    } finally {
      setAddingEdition(false);
    }
  };

  const refreshComparison = async (opts: {
    friendIds?: string[];
    comparisonId?: string | null;
    nextSort?: ComparisonSortMode;
    nextOnlyRated?: boolean;
  }) => {
    const nextCompId = opts.comparisonId !== undefined ? opts.comparisonId : activeComparisonId;
    const nextFriends = opts.friendIds ?? selectedFriendIds;
    const nextSort = opts.nextSort ?? sortBy;
    const nextOnly = opts.nextOnlyRated ?? onlyRated;

    setLoadingComparison(true);
    setError(null);
    try {
      if (nextCompId) {
        const res = await getSavedFestivalComparisonAction(nextCompId, {
          sortBy: nextSort,
          onlyRated: nextOnly,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setComparison(res.data);
      } else {
        if (nextFriends.length === 0) {
          setComparison(null);
          return;
        }
        const res = await getFestivalComparisonAction({
          editionId: festival.id,
          friendIds: nextFriends,
          sortBy: nextSort,
          onlyRated: nextOnly,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setComparison(res.data);
      }
    } finally {
      setLoadingComparison(false);
    }
  };

  const handleToggleFriend = (friendId: string) => {
    const next = selectedFriendIds.includes(friendId)
      ? selectedFriendIds.filter((id) => id !== friendId)
      : [...selectedFriendIds, friendId];
    setSelectedFriendIds(next);
    setActiveComparisonId(null);
    void refreshComparison({ friendIds: next, comparisonId: null });
  };

  const handleSelectSavedComparison = (compId: string | null) => {
    setActiveComparisonId(compId);
    void refreshComparison({ comparisonId: compId });
  };

  const handleSaveComparison = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFriendIds.length === 0) return;
    setSavingComparison(true);
    setError(null);
    try {
      const res = await createFestivalComparisonAction({
        editionId: festival.id,
        friendIds: selectedFriendIds,
        name: comparisonNameDraft.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const created = res.data;
      const summary: SavedFestivalComparisonSummaryDTO = {
        id: created.id,
        name: created.name,
        createdById: created.createdById,
        edition: created.edition,
        participants: created.participants.map((p) => p.user),
        jointAgendasCount: 0,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
      setSavedComparisons((prev) => [summary, ...prev]);
      setActiveComparisonId(created.id);
      setComparison(created);
      setComparisonNameDraft("");
      setShowSaveComparisonForm(false);
    } finally {
      setSavingComparison(false);
    }
  };

  const handleDeleteComparison = async (compId: string) => {
    setError(null);
    const res = await deleteFestivalComparisonAction(compId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedComparisons((prev) => prev.filter((c) => c.id !== compId));
    if (activeComparisonId === compId) {
      setActiveComparisonId(null);
      void refreshComparison({ comparisonId: null });
    }
  };

  const handleLoadAgenda = async (agendaId: string) => {
    setLoadingAgenda(true);
    setError(null);
    try {
      const res = await getJointAgendaAction(agendaId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setActiveAgenda(res.data);
      setSelectedDay(ALL_DAYS_KEY);
      setRegenThreshold(String(res.data.minRatingThreshold));
    } finally {
      setLoadingAgenda(false);
    }
  };

  const handleCreateAgenda = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedThreshold = Number(agendaThreshold);
    const safeThreshold =
      Number.isFinite(parsedThreshold) && parsedThreshold >= 1 && parsedThreshold <= 5
        ? parsedThreshold
        : FESTIVAL_RECOMMENDATION_THRESHOLD;

    setCreatingAgenda(true);
    setError(null);
    try {
      const res = await createJointAgendaAction(
        activeComparisonId
          ? {
              comparisonId: activeComparisonId,
              name: agendaNameDraft.trim() || undefined,
              strategy: agendaStrategy,
              minRatingThreshold: safeThreshold,
            }
          : {
              editionId: festival.id,
              friendIds: selectedFriendIds.length > 0 ? selectedFriendIds : undefined,
              name: agendaNameDraft.trim() || undefined,
              strategy: agendaStrategy,
              minRatingThreshold: safeThreshold,
            },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const created = res.data;
      const summary: JointAgendaSummaryDTO = {
        id: created.id,
        name: created.name,
        comparisonId: created.comparisonId,
        createdById: created.createdById,
        minRatingThreshold: created.minRatingThreshold,
        edition: created.edition,
        participants: created.participants.map((p) => p.user),
        itemsCount: created.items.length,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
      setAgendas((prev) => [summary, ...prev]);
      setActiveAgenda(created);
      setAgendaNameDraft("");
      setShowCreateAgendaForm(false);
      setActiveTab("agenda");
      setSelectedDay(ALL_DAYS_KEY);
    } finally {
      setCreatingAgenda(false);
    }
  };

  const syncAgendaSummaryCount = (updated: JointAgendaDetailDTO) => {
    setActiveAgenda(updated);
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === updated.id
          ? {
              ...a,
              itemsCount: updated.items.length,
              minRatingThreshold: updated.minRatingThreshold,
              updatedAt: updated.updatedAt,
            }
          : a,
      ),
    );
  };

  const handleToggleEntryInAgenda = async (entryId: string, included: boolean) => {
    if (!activeAgenda) return;
    setBusyEntryId(entryId);
    setError(null);
    try {
      const res = await setJointAgendaEntryAction({
        agendaId: activeAgenda.id,
        entryId,
        included,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      syncAgendaSummaryCount(res.data);
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleSaveGroupNote = async (entryId: string) => {
    if (!activeAgenda) return;
    setBusyEntryId(entryId);
    setError(null);
    try {
      const res = await setJointAgendaEntryAction({
        agendaId: activeAgenda.id,
        entryId,
        included: true,
        note: noteDrafts[entryId] ?? "",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      syncAgendaSummaryCount(res.data);
      setEditingNoteEntryId(null);
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleRegenerateAgenda = async () => {
    if (!activeAgenda) return;
    const parsedThreshold = Number(regenThreshold);
    const safeThreshold =
      Number.isFinite(parsedThreshold) && parsedThreshold >= 1 && parsedThreshold <= 5
        ? parsedThreshold
        : activeAgenda.minRatingThreshold;

    setRegenerating(true);
    setError(null);
    try {
      const res = await regenerateJointAgendaAction({
        agendaId: activeAgenda.id,
        strategy: regenStrategy,
        minRatingThreshold: safeThreshold,
        preserveManualEntries: preserveManual,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      syncAgendaSummaryCount(res.data);
      setShowRegeneratePanel(false);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDeleteOrLeaveAgenda = async () => {
    if (!activeAgenda) return;
    setError(null);
    const res = activeAgenda.isCreator
      ? await deleteJointAgendaAction(activeAgenda.id)
      : await leaveJointAgendaAction(activeAgenda.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const remaining = agendas.filter((a) => a.id !== activeAgenda.id);
    setAgendas(remaining);
    if (remaining[0]) {
      void handleLoadAgenda(remaining[0].id);
    } else {
      setActiveAgenda(null);
    }
  };

  const consensusLabel = (tag: EntryConsensusTag): string => {
    switch (tag) {
      case "UNANIMOUS_MUST_SEE":
        return gp.tagUnanimous;
      case "RECOMMENDED":
        return gp.tagRecommended;
      case "DIVISIVE":
        return gp.tagDivisive;
      case "SKIP":
        return gp.tagSkip;
      case "MIXED":
        return gp.tagMixed;
      case "PENDING":
        return gp.tagPending;
    }
  };

  const consensusBadgeClass = (tag: EntryConsensusTag): string => {
    switch (tag) {
      case "UNANIMOUS_MUST_SEE":
        return "border-acid bg-acid font-semibold text-acid-ink";
      case "RECOMMENDED":
        return "border-acid text-ink";
      case "DIVISIVE":
        return "border-line-strong bg-surface-elevated text-ink";
      case "SKIP":
        return "border-line text-ink-muted line-through";
      default:
        return "border-line text-ink-muted";
    }
  };

  const visibleRows: ComparisonEntryRowDTO[] = useMemo(() => {
    if (!comparison) return [];
    if (consensusFilter === "ALL") return comparison.rows;
    return comparison.rows.filter((row) => row.consensusTag === consensusFilter);
  }, [comparison, consensusFilter]);

  const availableEntriesToAdd = useMemo(() => {
    if (!comparison) return [];
    return comparison.rows.filter((row) => !activeAgendaEntryIds.has(row.entryId));
  }, [comparison, activeAgendaEntryIds]);

  const activeSavedComparison = savedComparisons.find((c) => c.id === activeComparisonId) ?? null;

  const agendaDays = useMemo(() => {
    if (!activeAgenda) return [ALL_DAYS_KEY];
    const dayKeys = activeAgenda.days.map((d) => d.day ?? "__TBA__");
    return [ALL_DAYS_KEY, ...dayKeys];
  }, [activeAgenda]);

  const effectiveDay = agendaDays.includes(selectedDay) ? selectedDay : ALL_DAYS_KEY;

  const visibleAgendaDayGroups = useMemo(() => {
    if (!activeAgenda) return [];
    if (effectiveDay === ALL_DAYS_KEY) return activeAgenda.days;
    return activeAgenda.days.filter((g) => (g.day ?? "__TBA__") === effectiveDay);
  }, [activeAgenda, effectiveDay]);

  const renderAgendaCard = (item: JointAgendaItemDTO) => {
    const metaLine = [item.day ?? dict.common.tba, item.setTime, item.stage]
      .filter(Boolean)
      .join(" · ");
    const isBusy = busyEntryId === item.entryId;
    const isEditingNote = editingNoteEntryId === item.entryId;
    const isHighAvg =
      item.averageRating !== null && item.averageRating >= FESTIVAL_RECOMMENDATION_THRESHOLD;

    return (
      <li
        key={item.entryId}
        className={`flex flex-col gap-2.5 border-b border-line px-4 py-3.5 sm:px-5 ${
          item.hasClash ? "border-l-4 border-l-line-strong bg-surface" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.66rem] uppercase tracking-[0.06em] text-ink-muted">
              <span>{metaLine}</span>
              {item.hasClash ? (
                <span className="border border-line-strong bg-ink px-1.5 py-0.5 text-[0.6rem] font-semibold text-bg">
                  {gp.clashBadge}
                </span>
              ) : null}
              <span
                className={`border px-1.5 py-0.5 text-[0.58rem] ${consensusBadgeClass(item.consensusTag)}`}
              >
                {consensusLabel(item.consensusTag)}
              </span>
            </div>

            <Link
              href={festivalCartelPath(festival, { q: item.billingName })}
              className="mt-1 block truncate font-display text-[1.1rem] font-extrabold leading-tight tracking-[-0.02em] text-ink hover:underline"
            >
              {item.billingName}
            </Link>
            {item.subtitle ? (
              <p className="font-serif text-[0.94rem] italic text-ink-muted">{item.subtitle}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={`border px-2 py-0.5 font-mono text-[0.74rem] ${
                isHighAvg
                  ? "border-acid bg-acid font-semibold text-acid-ink"
                  : "border-line text-ink"
              }`}
            >
              {item.averageRating !== null ? `${item.averageRating.toFixed(1)}/5` : "—"}
            </span>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleToggleEntryInAgenda(item.entryId, false)}
              className="cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-40"
            >
              {gp.removeFromAgendaAction}
            </button>
          </div>
        </div>

        {/* Participant scores strip */}
        {activeAgenda ? (
          <div className="flex flex-wrap gap-1.5">
            {activeAgenda.participants.map((part) => {
              const cell = item.cells.find((c) => c.userId === part.user.id);
              const scoreText = cell?.ratingsPrivate
                ? gp.privateRatingsTag
                : cell?.status === "DISCARDED"
                  ? "✕"
                  : cell?.rating !== null && cell?.rating !== undefined
                    ? `${cell.rating}/5`
                    : "—";
              const isMust =
                cell && !cell.ratingsPrivate && cell.rating !== null && cell.rating >= 4;
              return (
                <span
                  key={part.user.id}
                  className={`border px-1.5 py-0.5 font-mono text-[0.64rem] ${
                    isMust
                      ? "border-acid bg-acid/20 font-semibold text-ink"
                      : "border-line text-ink-muted"
                  }`}
                >
                  @{part.user.username} {scoreText}
                </span>
              );
            })}
          </div>
        ) : null}

        {/* Shared Group Note */}
        {isEditingNote ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="text"
              maxLength={280}
              value={noteDrafts[item.entryId] ?? item.note}
              onChange={(event) =>
                setNoteDrafts((prev) => ({ ...prev, [item.entryId]: event.target.value }))
              }
              placeholder={gp.groupNotePlaceholder}
              className="min-w-0 flex-1 border border-line bg-bg px-2.5 py-1.5 font-serif text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
            />
            <HairlineButton
              size="sm"
              variant="acid"
              disabled={isBusy}
              onClick={() => void handleSaveGroupNote(item.entryId)}
            >
              {gp.saveNoteAction}
            </HairlineButton>
            <HairlineButton size="sm" onClick={() => setEditingNoteEntryId(null)}>
              {dict.common.close}
            </HairlineButton>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {item.note ? (
              <p className="min-w-0 flex-1 font-serif text-[0.95rem] italic text-ink-muted">
                {item.note}
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => {
                setNoteDrafts((prev) => ({ ...prev, [item.entryId]: item.note }));
                setEditingNoteEntryId(item.entryId);
              }}
              className="shrink-0 cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-muted hover:text-ink"
            >
              {item.note ? dict.nav.manage : `+ ${gp.saveNoteAction}`}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="w-full">
      <FestivalHeaderNav
        brandSlug={festival.brandSlug}
        name={festival.name}
        year={festival.year}
        location={festival.location}
        activeTab="grupo"
      />

      {!inMyFestivals ? (
        <EmptyState
          title={gp.addFestivalFirstTitle}
          description={gp.addFestivalFirstDescription}
          action={
            <HairlineButton
              variant="acid"
              size="md"
              disabled={addingEdition}
              onClick={() => void handleAddFestivalEdition()}
            >
              {dict.catalog.addEditionAction}
            </HairlineButton>
          }
        />
      ) : coincidingFriends.length === 0 &&
        savedComparisons.length === 0 &&
        agendas.length === 0 ? (
        <EmptyState
          title={gp.noCoincidingFriendsTitle}
          description={gp.noCoincidingFriendsDescription}
          action={
            <Link
              href="/social"
              className="inline-flex border border-acid bg-acid px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-acid-ink"
            >
              {gp.goToSocialAction}
            </Link>
          }
        />
      ) : (
        <>
          {/* Sub-tab bar: Comparison Table vs Joint Agenda */}
          <div
            role="tablist"
            className="grid h-11 grid-cols-2 border-b border-line bg-bg sm:flex sm:items-stretch"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "comparison"}
              onClick={() => setActiveTab("comparison")}
              className={`cursor-pointer border-r border-line px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] transition-colors sm:px-6 ${
                activeTab === "comparison"
                  ? "bg-ink font-semibold text-bg"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {gp.tabComparison}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "agenda"}
              onClick={() => setActiveTab("agenda")}
              className={`cursor-pointer px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] transition-colors sm:border-r sm:border-line sm:px-6 ${
                activeTab === "agenda"
                  ? "bg-ink font-semibold text-bg"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {gp.tabJointAgenda(agendas.length)}
            </button>
          </div>

          {error ? (
            <p
              role="alert"
              className="border-b border-line-strong bg-surface px-4 py-2.5 font-mono text-xs text-ink sm:px-6"
            >
              {error}
            </p>
          ) : null}

          {/* ==========================================================
              TAB 1: FESTIVAL COMPARISON TABLE & >= 3.2 RECOMMENDATION
              ========================================================== */}
          {activeTab === "comparison" ? (
            <div>
              {/* Recommendation Verdict Banner */}
              {comparison ? (
                <section
                  className={`border-b border-line px-4 py-5 sm:px-6 sm:py-6 ${
                    comparison.recommendation.verdict === "RECOMMENDED"
                      ? "bg-acid text-acid-ink"
                      : "bg-surface text-ink"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div
                        className={`font-mono text-[0.68rem] font-semibold uppercase tracking-[0.1em] ${
                          comparison.recommendation.verdict === "RECOMMENDED"
                            ? "text-acid-ink/80"
                            : "text-ink-muted"
                        }`}
                      >
                        {gp.groupAverageLabel} ·{" "}
                        {gp.verdictThresholdHint(comparison.recommendation.threshold.toFixed(1))}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                        <span className="font-display text-[clamp(2rem,6vw,3.4rem)] font-extrabold leading-none tracking-[-0.04em]">
                          {comparison.recommendation.averageRating !== null
                            ? `${comparison.recommendation.averageRating.toFixed(2)}/5`
                            : "—"}
                        </span>
                        <span
                          className={`border px-2.5 py-1 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${
                            comparison.recommendation.verdict === "RECOMMENDED"
                              ? "border-acid-ink bg-acid-ink text-acid"
                              : "border-line-strong bg-bg text-ink"
                          }`}
                        >
                          {comparison.recommendation.verdict === "RECOMMENDED"
                            ? gp.verdictRecommended
                            : comparison.recommendation.verdict === "NOT_RECOMMENDED"
                              ? gp.verdictNotRecommended
                              : gp.verdictInsufficientData}
                        </span>
                      </div>

                      <p
                        className={`mt-2 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${
                          comparison.recommendation.verdict === "RECOMMENDED"
                            ? "text-acid-ink/80"
                            : "text-ink-muted"
                        }`}
                      >
                        {gp.coverageStat(
                          comparison.recommendation.ratedArtistsCount,
                          comparison.recommendation.totalArtistsCount,
                          comparison.recommendation.totalRatingsCount,
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateAgendaForm(true);
                          setActiveTab("agenda");
                        }}
                        className={`cursor-pointer border px-3.5 py-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-90 ${
                          comparison.recommendation.verdict === "RECOMMENDED"
                            ? "border-acid-ink bg-acid-ink text-acid"
                            : "border-acid bg-acid text-acid-ink"
                        }`}
                      >
                        {gp.createAgendaFromComparison}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Friend Selector + Saved Comparisons Strip */}
              <section className="flex flex-col gap-3 border-b border-line bg-bg px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted">
                      {gp.participantsTitle}:
                    </span>
                    {coincidingFriends.map((friend) => {
                      const isSelected = selectedFriendIds.includes(friend.id);
                      return (
                        <button
                          key={friend.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleToggleFriend(friend.id)}
                          className={`inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.04em] transition-colors ${
                            isSelected && !activeComparisonId
                              ? "border-acid bg-acid font-semibold text-acid-ink"
                              : "border-line bg-surface text-ink-muted hover:border-ink hover:text-ink"
                          }`}
                        >
                          <span>@{friend.username}</span>
                          {!friend.ratingsVisible ? (
                            <span className="text-[0.58rem] opacity-75">
                              ({gp.privateRatingsTag})
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {savedComparisons.length > 0 ? (
                      <select
                        aria-label={gp.savedComparisonsTitle}
                        value={activeComparisonId ?? ""}
                        onChange={(event) =>
                          handleSelectSavedComparison(event.target.value || null)
                        }
                        className="border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-acid"
                      >
                        <option value="">{gp.liveComparisonOption}</option>
                        {savedComparisons.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {activeSavedComparison &&
                    activeSavedComparison.createdById === currentUserId ? (
                      <HairlineButton
                        size="sm"
                        onClick={() => void handleDeleteComparison(activeSavedComparison.id)}
                      >
                        {gp.deleteComparisonAction}
                      </HairlineButton>
                    ) : (
                      <HairlineButton
                        size="sm"
                        variant={showSaveComparisonForm ? "default" : "inverted"}
                        disabled={selectedFriendIds.length === 0}
                        onClick={() => setShowSaveComparisonForm((prev) => !prev)}
                      >
                        {showSaveComparisonForm ? dict.common.close : gp.saveComparisonAction}
                      </HairlineButton>
                    )}
                  </div>
                </div>

                {showSaveComparisonForm ? (
                  <form
                    onSubmit={(event) => void handleSaveComparison(event)}
                    className="flex flex-wrap items-center gap-2 border border-line bg-surface p-3"
                  >
                    <input
                      id={`${formId}-comp-name`}
                      type="text"
                      maxLength={120}
                      value={comparisonNameDraft}
                      onChange={(event) => setComparisonNameDraft(event.target.value)}
                      placeholder={gp.comparisonNamePlaceholder}
                      className="min-w-0 flex-1 border border-line bg-bg px-3 py-1.5 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                    />
                    <HairlineButton
                      type="submit"
                      size="sm"
                      variant="acid"
                      disabled={savingComparison}
                    >
                      {savingComparison ? gp.savingComparison : gp.saveComparisonAction}
                    </HairlineButton>
                  </form>
                ) : null}
              </section>

              {/* Participant Summary Cards */}
              {comparison ? (
                <section className="grid grid-cols-2 border-b border-line sm:grid-cols-3 desktop:grid-cols-4">
                  {comparison.participants.map((p) => (
                    <div
                      key={p.user.id}
                      className="flex items-center gap-2.5 border-r border-b border-line bg-bg px-3.5 py-3 last:border-r-0"
                    >
                      <UserAvatar
                        avatarPath={p.user.avatarPath}
                        username={p.user.username}
                        displayName={p.user.displayName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-xs font-semibold text-ink">
                            @{p.user.username}
                          </span>
                          {p.isViewer ? (
                            <span className="bg-acid px-1 py-0.5 font-mono text-[0.55rem] font-semibold text-acid-ink">
                              {gp.youTag}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[0.64rem] uppercase text-ink-muted">
                          {!p.ratingsVisible
                            ? gp.privateRatingsTag
                            : [
                                p.averageRating !== null
                                  ? gp.participantAvg(p.averageRating.toFixed(1))
                                  : null,
                                gp.participantRated(p.ratedEntriesCount),
                                gp.participantMustSee(p.mustSeeCount),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {/* Table Filter & Sort Bar */}
              <section className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "ALL", label: gp.consensusAll },
                      { id: "UNANIMOUS_MUST_SEE", label: gp.consensusUnanimous },
                      { id: "RECOMMENDED", label: gp.consensusRecommended },
                      { id: "DIVISIVE", label: gp.consensusDivisive },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setConsensusFilter(item.id)}
                      className={`cursor-pointer border px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.06em] transition-colors ${
                        consensusFilter === item.id
                          ? "border-ink bg-ink font-semibold text-bg"
                          : "border-line bg-bg text-ink-muted hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={onlyRated}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setOnlyRated(next);
                        void refreshComparison({ nextOnlyRated: next });
                      }}
                    />
                    <span>{gp.onlyRatedToggle}</span>
                  </label>

                  <select
                    aria-label={gp.sortLabel}
                    value={sortBy}
                    onChange={(event) => {
                      const next = event.target.value as ComparisonSortMode;
                      setSortBy(next);
                      void refreshComparison({ nextSort: next });
                    }}
                    className="border border-line bg-bg px-2.5 py-1 font-mono text-xs uppercase text-ink outline-none focus:border-acid"
                  >
                    <option value="AVG_DESC">{gp.sortAvgDesc}</option>
                    <option value="MUST_SEE_DESC">{gp.sortMustSeeDesc}</option>
                    <option value="DISAGREEMENT_DESC">{gp.sortDisagreementDesc}</option>
                    <option value="LINEUP">{gp.sortLineup}</option>
                    <option value="AVG_ASC">{gp.sortAvgAsc}</option>
                  </select>
                </div>
              </section>

              {/* Comparison Matrix Content */}
              {loadingComparison ? (
                <p className="px-4 py-8 font-mono text-xs uppercase text-ink-muted sm:px-6">
                  {dict.common.searching}
                </p>
              ) : !comparison || visibleRows.length === 0 ? (
                <EmptyState title={gp.emptyRowsTitle} description={gp.emptyRowsDescription} />
              ) : (
                <>
                  {/* Mobile (< 640px): zero-overflow stacked comparison cards */}
                  <ul className="sm:hidden">
                    {visibleRows.map((row) => {
                      const isHighAvg =
                        row.averageRating !== null &&
                        row.averageRating >= FESTIVAL_RECOMMENDATION_THRESHOLD;
                      const inAgenda = activeAgendaEntryIds.has(row.entryId);
                      return (
                        <li key={row.entryId} className="border-b border-line px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase ${consensusBadgeClass(
                                    row.consensusTag,
                                  )}`}
                                >
                                  {consensusLabel(row.consensusTag)}
                                </span>
                                {row.day || row.stage ? (
                                  <span className="truncate font-mono text-[0.62rem] uppercase text-ink-muted">
                                    {[row.day, row.setTime, row.stage].filter(Boolean).join(" · ")}
                                  </span>
                                ) : null}
                              </div>
                              <Link
                                href={festivalCartelPath(festival, { q: row.billingName })}
                                className="mt-1 block truncate font-display text-[1.08rem] font-extrabold leading-tight tracking-[-0.02em] text-ink"
                              >
                                {row.billingName}
                              </Link>
                            </div>

                            <span
                              className={`shrink-0 border px-2 py-1 font-mono text-xs ${
                                isHighAvg
                                  ? "border-acid bg-acid font-semibold text-acid-ink"
                                  : "border-line text-ink"
                              }`}
                            >
                              {row.averageRating !== null ? `${row.averageRating.toFixed(1)}` : "—"}
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              {comparison.participants.map((p) => {
                                const cell = row.cells.find((c) => c.userId === p.user.id);
                                const isMust =
                                  cell &&
                                  !cell.ratingsPrivate &&
                                  cell.rating !== null &&
                                  cell.rating >= 4;
                                const val = cell?.ratingsPrivate
                                  ? gp.privateRatingsTag
                                  : cell?.status === "DISCARDED"
                                    ? "✕"
                                    : cell?.rating !== null && cell?.rating !== undefined
                                      ? `${cell.rating}/5`
                                      : "—";
                                return (
                                  <span
                                    key={p.user.id}
                                    className={`border px-1.5 py-0.5 font-mono text-[0.64rem] ${
                                      isMust
                                        ? "border-acid bg-acid font-semibold text-acid-ink"
                                        : "border-line text-ink-muted"
                                    }`}
                                  >
                                    @{p.user.username} {val}
                                  </span>
                                );
                              })}
                            </div>

                            {activeAgenda ? (
                              <button
                                type="button"
                                disabled={busyEntryId === row.entryId}
                                onClick={() =>
                                  void handleToggleEntryInAgenda(row.entryId, !inAgenda)
                                }
                                className={`cursor-pointer border px-2 py-0.5 font-mono text-[0.62rem] uppercase ${
                                  inAgenda
                                    ? "border-acid bg-acid font-semibold text-acid-ink"
                                    : "border-line text-ink-muted"
                                }`}
                              >
                                {inAgenda ? gp.inAgendaBadge : gp.addToAgendaAction}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Tablet / Desktop / Wide (>= 640px): full comparison table */}
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line bg-surface font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-muted">
                          <th className="sticky left-0 z-10 border-r border-line bg-surface px-4 py-3">
                            {gp.colArtist}
                          </th>
                          {comparison.participants.map((p) => (
                            <th
                              key={p.user.id}
                              className="border-r border-line px-3 py-3 text-center whitespace-nowrap"
                            >
                              @{p.user.username}
                            </th>
                          ))}
                          <th className="border-r border-line px-3 py-3 text-center whitespace-nowrap">
                            {gp.colAverage}
                          </th>
                          {activeAgenda ? (
                            <th className="px-3 py-3 text-center whitespace-nowrap">
                              {gp.colAgenda}
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const isHighAvg =
                            row.averageRating !== null &&
                            row.averageRating >= FESTIVAL_RECOMMENDATION_THRESHOLD;
                          const inAgenda = activeAgendaEntryIds.has(row.entryId);

                          return (
                            <tr
                              key={row.entryId}
                              className="border-b border-line transition-colors hover:bg-surface"
                            >
                              <td className="sticky left-0 z-10 max-w-[320px] border-r border-line bg-bg px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase ${consensusBadgeClass(
                                      row.consensusTag,
                                    )}`}
                                  >
                                    {consensusLabel(row.consensusTag)}
                                  </span>
                                  <Link
                                    href={festivalCartelPath(festival, { q: row.billingName })}
                                    className="truncate font-display text-[1.02rem] font-extrabold tracking-[-0.02em] text-ink hover:underline"
                                  >
                                    {row.billingName}
                                  </Link>
                                </div>
                                {row.day || row.stage || row.setTime ? (
                                  <div className="mt-0.5 truncate font-mono text-[0.64rem] uppercase text-ink-muted">
                                    {[row.day, row.setTime, row.stage].filter(Boolean).join(" · ")}
                                  </div>
                                ) : null}
                              </td>

                              {comparison.participants.map((p) => {
                                const cell = row.cells.find((c) => c.userId === p.user.id);
                                const isMust =
                                  cell &&
                                  !cell.ratingsPrivate &&
                                  cell.rating !== null &&
                                  cell.rating >= 4;
                                return (
                                  <td
                                    key={p.user.id}
                                    className="border-r border-line px-3 py-3 text-center font-mono text-xs"
                                  >
                                    {cell?.ratingsPrivate ? (
                                      <span className="text-[0.66rem] uppercase text-ink-muted">
                                        {gp.privateRatingsTag}
                                      </span>
                                    ) : cell?.status === "DISCARDED" ? (
                                      <span className="text-ink-muted">✕</span>
                                    ) : cell?.rating !== null && cell?.rating !== undefined ? (
                                      <span
                                        className={`inline-block border px-2 py-0.5 ${
                                          isMust
                                            ? "border-acid bg-acid font-semibold text-acid-ink"
                                            : "border-line text-ink"
                                        }`}
                                      >
                                        {cell.rating}/5
                                      </span>
                                    ) : (
                                      <span className="text-ink-muted">—</span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="border-r border-line px-3 py-3 text-center font-mono text-xs">
                                <span
                                  className={`inline-block border px-2 py-0.5 ${
                                    isHighAvg
                                      ? "border-acid bg-acid font-semibold text-acid-ink"
                                      : "border-line text-ink"
                                  }`}
                                >
                                  {row.averageRating !== null
                                    ? `${row.averageRating.toFixed(1)}/5`
                                    : "—"}
                                </span>
                              </td>

                              {activeAgenda ? (
                                <td className="px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    disabled={busyEntryId === row.entryId}
                                    onClick={() =>
                                      void handleToggleEntryInAgenda(row.entryId, !inAgenda)
                                    }
                                    className={`cursor-pointer border px-2 py-1 font-mono text-[0.64rem] uppercase transition-colors disabled:opacity-40 ${
                                      inAgenda
                                        ? "border-acid bg-acid font-semibold text-acid-ink"
                                        : "border-line text-ink-muted hover:border-ink hover:text-ink"
                                    }`}
                                  >
                                    {inAgenda ? gp.inAgendaBadge : gp.addToAgendaAction}
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ==========================================================
               TAB 2: JOINT AGENDA (PLANNING + CLASH DETECTION)
               ========================================================== */
            <div>
              {/* Agenda Selector + Create New Agenda Bar */}
              <section className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                      {gp.agendasTitle}:
                    </span>
                    {agendas.map((ag) => {
                      const isCurrent = activeAgenda?.id === ag.id;
                      return (
                        <button
                          key={ag.id}
                          type="button"
                          onClick={() => void handleLoadAgenda(ag.id)}
                          className={`cursor-pointer border px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] transition-colors ${
                            isCurrent
                              ? "border-acid bg-acid font-semibold text-acid-ink"
                              : "border-line bg-bg text-ink hover:border-ink"
                          }`}
                        >
                          {ag.name} ({ag.itemsCount})
                        </button>
                      );
                    })}
                  </div>

                  <HairlineButton
                    size="sm"
                    variant={showCreateAgendaForm ? "default" : "acid"}
                    onClick={() => setShowCreateAgendaForm((prev) => !prev)}
                  >
                    {showCreateAgendaForm ? dict.common.close : gp.newAgendaButton}
                  </HairlineButton>
                </div>

                {showCreateAgendaForm ? (
                  <form
                    onSubmit={(event) => void handleCreateAgenda(event)}
                    className="grid grid-cols-1 gap-3 border border-line bg-bg p-4 sm:grid-cols-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor={`${formId}-ag-name`}
                        className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                      >
                        {gp.agendasTitle}
                      </label>
                      <input
                        id={`${formId}-ag-name`}
                        type="text"
                        maxLength={120}
                        value={agendaNameDraft}
                        onChange={(event) => setAgendaNameDraft(event.target.value)}
                        placeholder={gp.agendaNamePlaceholder}
                        className="w-full min-w-0 border border-line bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                      />
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor={`${formId}-ag-strategy`}
                        className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                      >
                        {gp.strategyLabel}
                      </label>
                      <select
                        id={`${formId}-ag-strategy`}
                        value={agendaStrategy}
                        onChange={(event) =>
                          setAgendaStrategy(event.target.value as JointAgendaStrategy)
                        }
                        className="w-full min-w-0 border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                      >
                        <option value="RECOMMENDED">{gp.strategyRecommended}</option>
                        <option value="MUST_SEE">{gp.strategyMustSee}</option>
                        <option value="SHARED_FAVORITES">{gp.strategySharedFavorites}</option>
                        <option value="EMPTY">{gp.strategyEmpty}</option>
                      </select>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label
                        htmlFor={`${formId}-ag-threshold`}
                        className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-ink-muted"
                      >
                        {gp.thresholdLabel}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`${formId}-ag-threshold`}
                          type="number"
                          step="0.1"
                          min="1"
                          max="5"
                          value={agendaThreshold}
                          onChange={(event) => setAgendaThreshold(event.target.value)}
                          className="w-24 border border-line bg-surface px-2.5 py-2 font-mono text-xs text-ink focus:border-acid focus:outline-none"
                        />
                        <HairlineButton
                          type="submit"
                          size="sm"
                          variant="acid"
                          disabled={creatingAgenda}
                          className="flex-1 justify-center"
                        >
                          {creatingAgenda ? gp.creatingAgenda : gp.createAgendaSubmit}
                        </HairlineButton>
                      </div>
                    </div>
                  </form>
                ) : null}
              </section>

              {loadingAgenda ? (
                <p className="px-4 py-8 font-mono text-xs uppercase text-ink-muted sm:px-6">
                  {dict.common.searching}
                </p>
              ) : !activeAgenda ? (
                <EmptyState
                  title={gp.emptyAgendasTitle}
                  description={gp.emptyAgendasDescription}
                  action={
                    <HairlineButton
                      variant="acid"
                      size="md"
                      onClick={() => setShowCreateAgendaForm(true)}
                    >
                      {gp.newAgendaButton}
                    </HairlineButton>
                  }
                />
              ) : (
                <>
                  {/* Active Agenda Header + Controls */}
                  <section className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-[1.35rem] font-extrabold uppercase tracking-[-0.02em] text-ink">
                          {activeAgenda.name}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase text-ink-muted">
                          <span>
                            {activeAgenda.participants
                              .map((p) => `@${p.user.username}`)
                              .join(" · ")}
                          </span>
                          <span>·</span>
                          <span>≥ {activeAgenda.minRatingThreshold.toFixed(1)}/5</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <HairlineButton
                          size="sm"
                          onClick={() => setShowRegeneratePanel((prev) => !prev)}
                        >
                          {showRegeneratePanel ? dict.common.close : gp.regenerateButton}
                        </HairlineButton>
                        {confirmDeleteAgenda ? (
                          <>
                            <HairlineButton
                              size="sm"
                              variant="inverted"
                              onClick={() => {
                                setConfirmDeleteAgenda(false);
                                void handleDeleteOrLeaveAgenda();
                              }}
                            >
                              {activeAgenda.isCreator
                                ? gp.deleteAgendaAction
                                : gp.leaveAgendaAction}
                            </HairlineButton>
                            <HairlineButton size="sm" onClick={() => setConfirmDeleteAgenda(false)}>
                              {dict.common.close}
                            </HairlineButton>
                          </>
                        ) : (
                          <HairlineButton size="sm" onClick={() => setConfirmDeleteAgenda(true)}>
                            {activeAgenda.isCreator ? gp.deleteAgendaAction : gp.leaveAgendaAction}
                          </HairlineButton>
                        )}
                      </div>
                    </div>

                    {showRegeneratePanel ? (
                      <div className="flex flex-wrap items-center gap-3 border border-line bg-surface p-3">
                        <select
                          aria-label={gp.strategyLabel}
                          value={regenStrategy}
                          onChange={(event) =>
                            setRegenStrategy(event.target.value as JointAgendaStrategy)
                          }
                          className="border border-line bg-bg px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-acid"
                        >
                          <option value="RECOMMENDED">{gp.strategyRecommended}</option>
                          <option value="MUST_SEE">{gp.strategyMustSee}</option>
                          <option value="SHARED_FAVORITES">{gp.strategySharedFavorites}</option>
                        </select>

                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="5"
                          aria-label={gp.thresholdLabel}
                          value={regenThreshold}
                          onChange={(event) => setRegenThreshold(event.target.value)}
                          className="w-20 border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-acid"
                        />

                        <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[0.68rem] uppercase text-ink-muted">
                          <input
                            type="checkbox"
                            checked={preserveManual}
                            onChange={(event) => setPreserveManual(event.target.checked)}
                          />
                          <span>{gp.preserveManualLabel}</span>
                        </label>

                        <HairlineButton
                          size="sm"
                          variant="acid"
                          disabled={regenerating}
                          onClick={() => void handleRegenerateAgenda()}
                        >
                          {regenerating ? gp.regenerating : gp.regenerateButton}
                        </HairlineButton>
                      </div>
                    ) : null}

                    {/* Quick Add Lineup Entry to Joint Agenda */}
                    {availableEntriesToAdd.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={gp.addEntryPlaceholder}
                          value={addEntryId}
                          onChange={(event) => setAddEntryId(event.target.value)}
                          className="min-w-0 flex-1 border border-line bg-surface px-3 py-2 font-sans text-sm text-ink outline-none focus:border-acid"
                        >
                          <option value="">{gp.addEntryPlaceholder}</option>
                          {availableEntriesToAdd.map((row) => (
                            <option key={row.entryId} value={row.entryId}>
                              {row.billingName}
                              {row.day
                                ? ` (${row.day}${row.setTime ? ` · ${row.setTime}` : ""})`
                                : ""}
                              {row.averageRating !== null
                                ? ` — ${row.averageRating.toFixed(1)}/5`
                                : ""}
                            </option>
                          ))}
                        </select>
                        <HairlineButton
                          size="sm"
                          variant="acid"
                          disabled={!addEntryId || busyEntryId === addEntryId}
                          onClick={() => {
                            if (!addEntryId) return;
                            const target = addEntryId;
                            setAddEntryId("");
                            void handleToggleEntryInAgenda(target, true);
                          }}
                        >
                          {gp.addEntryButton}
                        </HairlineButton>
                      </div>
                    ) : null}
                  </section>

                  {/* Conflicts Warning Band */}
                  {activeAgenda.conflicts.length > 0 ? (
                    <section className="border-b border-line-strong bg-surface px-4 py-3.5 sm:px-6">
                      <div className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink">
                        ⚠ {gp.conflictsTitle(activeAgenda.conflicts.length)}
                      </div>
                      <ul className="mt-2 flex flex-col gap-1 font-mono text-xs text-ink-muted">
                        {activeAgenda.conflicts.map((conflict) => (
                          <li key={`${conflict.entryIdA}-${conflict.entryIdB}`}>
                            <span className="font-semibold text-ink">{conflict.day}:</span>{" "}
                            {conflict.setTimeA} {conflict.billingNameA} ↔ {conflict.setTimeB}{" "}
                            {conflict.billingNameB}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {/* Day Filter Strip */}
                  {activeAgenda.days.length > 0 ? (
                    <div role="tablist" className="flex overflow-x-auto border-b border-line bg-bg">
                      {agendaDays.map((dayKey) => {
                        const isActive = effectiveDay === dayKey;
                        const label =
                          dayKey === ALL_DAYS_KEY
                            ? gp.allDays
                            : dayKey === "__TBA__"
                              ? dict.common.tba
                              : dayKey;
                        return (
                          <button
                            key={dayKey}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setSelectedDay(dayKey)}
                            className={`shrink-0 cursor-pointer border-r border-line px-3.5 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                              isActive
                                ? "bg-acid font-semibold text-acid-ink"
                                : "text-ink-muted hover:bg-surface hover:text-ink"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Agenda Items */}
                  {activeAgenda.items.length === 0 ? (
                    <EmptyState
                      title={gp.emptyAgendaItemsTitle}
                      description={gp.emptyAgendaItemsDescription}
                    />
                  ) : effectiveDay === ALL_DAYS_KEY && activeAgenda.days.length > 1 ? (
                    <>
                      <div className="wide:hidden">
                        {visibleAgendaDayGroups.map((group) => (
                          <section key={group.day ?? "__TBA__"}>
                            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.1em] sm:px-6">
                              <span>{group.day ?? dict.common.tba}</span>
                              <span className="text-ink-muted">{group.items.length}</span>
                            </div>
                            <ul className="grid grid-cols-1 tablet-h:grid-cols-2 tablet-h:[&>li]:border-r tablet-h:[&>li]:border-line">
                              {group.items.map(renderAgendaCard)}
                            </ul>
                          </section>
                        ))}
                      </div>

                      <section
                        aria-label={gp.agendasTitle}
                        className="hidden wide:grid"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(activeAgenda.days.length, 4)}, minmax(0, 1fr))`,
                        }}
                      >
                        {activeAgenda.days.map((group) => (
                          <div
                            key={group.day ?? "__TBA__"}
                            className="border-r border-line last:border-r-0"
                          >
                            <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.1em]">
                              <span>{group.day ?? dict.common.tba}</span>
                              <span className="text-ink-muted">{group.items.length}</span>
                            </div>
                            <ul>{group.items.map(renderAgendaCard)}</ul>
                          </div>
                        ))}
                      </section>
                    </>
                  ) : (
                    <ul className="grid grid-cols-1 tablet-h:grid-cols-2 tablet-h:[&>li]:border-r tablet-h:[&>li]:border-line">
                      {visibleAgendaDayGroups.flatMap((g) => g.items).map(renderAgendaCard)}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
