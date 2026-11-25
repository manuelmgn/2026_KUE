"use client";

import { useEffect, useRef, useState } from "react";
import {
  getArtistDetailAction,
  saveAlbumCustomUrlAction,
  saveArtistNotesAction,
  toggleAlbumPinAction,
} from "@/actions/artist-actions";
import { updateEntryScheduleAction } from "@/actions/entry-actions";
import { DisambiguateModal } from "@/components/features/DisambiguateModal";
import type { ArtistDetailDTO, LineupEntryDTO } from "@/components/features/types";
import { Artwork } from "@/components/ui/Artwork";
import { Drawer } from "@/components/ui/Drawer";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { RatingControl } from "@/components/ui/RatingControl";
import { getAlbumExternalLinks, getArtistExternalLinks } from "@/domain/external-links";
import { toMediaApiUrl } from "@/domain/media-url";
import { sortAlbumsForShelf } from "@/domain/rating";
import type { ArtistStatus } from "@/domain/schemas";

interface ArtistDrawerProps {
  entry: LineupEntryDTO | null;
  onClose: () => void;
  onRateArtist: (artistId: string, rating: number) => void;
  onStatusArtist: (artistId: string, status: ArtistStatus) => void;
  onNotesSaved: (artistId: string, notes: string) => void;
  onEntryUpdated: (
    entryId: string,
    patch: {
      day: string | null;
      stage: string | null;
      setTime: string | null;
      liveRating: number | null;
      liveNotes: string;
    },
  ) => void;
}

const STATUS_LABELS: Array<{ value: ArtistStatus; label: string }> = [
  { value: "PENDING", label: "Pendiente" },
  { value: "LISTENING", label: "Escuchando" },
  { value: "RATED", label: "Valorado" },
  { value: "DISCARDED", label: "Descartado" },
];

export function ArtistDrawer({
  entry,
  onClose,
  onRateArtist,
  onStatusArtist,
  onNotesSaved,
  onEntryUpdated,
}: ArtistDrawerProps) {
  const [activeArtistIdx, setActiveArtistIdx] = useState(0);
  const [detail, setDetail] = useState<ArtistDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaveState, setNotesSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [disambigOpen, setDisambigOpen] = useState(false);
  const [editingAlbumUrlId, setEditingAlbumUrlId] = useState<string | null>(null);
  const [albumUrlDraft, setAlbumUrlDraft] = useState("");
  const [albumUrlError, setAlbumUrlError] = useState<string | null>(null);

  // Inline schedule / live rating state for current festival entry
  const [dayDraft, setDayDraft] = useState("");
  const [stageDraft, setStageDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");
  const [liveRatingDraft, setLiveRatingDraft] = useState<number | null>(null);
  const [liveNotesDraft, setLiveNotesDraft] = useState("");
  const [liveSaveState, setLiveSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [liveSaveError, setLiveSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNotesRef = useRef<string>("");

  const activeSummary = entry?.artists[activeArtistIdx] ?? entry?.artists[0] ?? null;
  const activeArtistId = activeSummary?.id ?? null;
  const initialArtistNotesRef = useRef<string>("");
  initialArtistNotesRef.current = activeSummary?.notes ?? "";

  const entryId = entry?.id ?? null;
  const entryDay = entry?.day ?? "";
  const entryStage = entry?.stage ?? "";
  const entrySetTime = entry?.setTime ?? "";
  const entryLiveRating = entry?.liveRating ?? null;
  const entryLiveNotes = entry?.liveNotes ?? "";

  // Reset collaboration tab and modal state only when switching to a different lineup entry.
  useEffect(() => {
    setDisambigOpen(false);
    setEditingAlbumUrlId(null);
    setAlbumUrlError(null);
    if (entryId !== null) {
      setActiveArtistIdx(0);
    }
  }, [entryId]);

  // Keep schedule / live-rating draft fields synced with the entry prop.
  useEffect(() => {
    if (entryId) {
      setDayDraft(entryDay);
      setStageDraft(entryStage);
      setTimeDraft(entrySetTime);
      setLiveRatingDraft(entryLiveRating);
      setLiveNotesDraft(entryLiveNotes);
      setLiveSaveState("idle");
      setLiveSaveError(null);
    }
  }, [entryId, entryDay, entryStage, entrySetTime, entryLiveRating, entryLiveNotes]);

  const reloadArtistDetail = async (artistId: string) => {
    setLoadingDetail(true);
    try {
      const data = await getArtistDetailAction(artistId);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Fetch full detail and seed notes draft only when the active artist changes (never on note saves).
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!activeArtistId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    const initialNotes = initialArtistNotesRef.current;
    setNotesDraft(initialNotes);
    lastSavedNotesRef.current = initialNotes;
    setNotesSaveState("idle");
    setLoadingDetail(true);

    void getArtistDetailAction(activeArtistId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [activeArtistId]);

  const flushNotesSave = async (artistId: string, text: string) => {
    if (text === lastSavedNotesRef.current) {
      return;
    }
    setNotesSaveState("saving");
    const res = await saveArtistNotesAction({ artistId, notes: text });
    if (!res.ok) {
      setNotesSaveState("error");
      return;
    }
    lastSavedNotesRef.current = res.data.notes;
    onNotesSaved(artistId, res.data.notes);
    setNotesSaveState("saved");
  };

  const handleNotesChange = (value: string) => {
    setNotesDraft(value);
    setNotesSaveState("idle");
    if (!activeSummary) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const targetId = activeSummary.id;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void flushNotesSave(targetId, value);
    }, 600);
  };

  const handleTogglePin = async (albumId: string, currentlyPinned: boolean) => {
    const nextPinned = !currentlyPinned;
    const applyPin = (pinned: boolean) =>
      setDetail((prev) => {
        if (!prev) {
          return prev;
        }
        const nextAlbums = prev.albums.map((album) =>
          album.id === albumId ? { ...album, isPinned: pinned } : album,
        );
        return { ...prev, albums: sortAlbumsForShelf(nextAlbums) };
      });

    applyPin(nextPinned);
    const res = await toggleAlbumPinAction({ albumId, isPinned: nextPinned });
    if (!res.ok) {
      applyPin(currentlyPinned);
    }
  };

  const handleSaveCustomUrl = async (albumId: string) => {
    setAlbumUrlError(null);
    const res = await saveAlbumCustomUrlAction({
      albumId,
      customUrl: albumUrlDraft.trim() || null,
    });
    if (!res.ok) {
      setAlbumUrlError(res.error);
      return;
    }
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            albums: prev.albums.map((album) =>
              album.id === albumId ? { ...album, customUrl: res.data.customUrl } : album,
            ),
          }
        : prev,
    );
    setEditingAlbumUrlId(null);
  };

  const handleSaveEntrySchedule = async () => {
    if (!entry) {
      return;
    }
    setLiveSaveState("saving");
    setLiveSaveError(null);
    const res = await updateEntryScheduleAction({
      entryId: entry.id,
      day: dayDraft.trim() || null,
      stage: stageDraft.trim() || null,
      setTime: timeDraft.trim() || null,
      liveRating: liveRatingDraft,
      liveNotes: liveNotesDraft,
    });
    if (!res.ok) {
      setLiveSaveState("error");
      setLiveSaveError(res.error);
      return;
    }
    onEntryUpdated(entry.id, {
      day: res.data.day,
      stage: res.data.stage,
      setTime: res.data.setTime,
      liveRating: res.data.liveRating,
      liveNotes: res.data.liveNotes,
    });
    setLiveSaveState("saved");
    if (activeSummary) {
      void reloadArtistDetail(activeSummary.id);
    }
  };

  const headerLabel = entry
    ? [entry.day ?? "TBA", entry.stage ?? "TBA", entry.setTime].filter(Boolean).join(" · ")
    : "Ficha";

  const displayArtist = activeSummary;
  const externalLinks = displayArtist ? getArtistExternalLinks(displayArtist.name) : null;
  const imageSrc = toMediaApiUrl(detail?.imagePath ?? displayArtist?.imagePath);

  return (
    <>
      <Drawer
        open={entry !== null}
        onClose={onClose}
        headerLabel={headerLabel}
        ariaLabel={displayArtist ? `Ficha de ${displayArtist.name}` : "Ficha de artista"}
      >
        {entry && displayArtist ? (
          <div>
            {entry.artists.length > 1 ? (
              <div
                role="tablist"
                aria-label="Artistas en esta colaboración"
                className="flex border-b border-line"
              >
                {entry.artists.map((artist, index) => {
                  const isActive = index === activeArtistIdx;
                  return (
                    <button
                      key={artist.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveArtistIdx(index)}
                      className={`flex-1 cursor-pointer border-r border-line px-4 py-3 text-left font-mono text-[0.76rem] uppercase transition-colors last:border-r-0 ${
                        isActive
                          ? "bg-acid font-semibold text-acid-ink"
                          : "text-ink-muted hover:bg-surface hover:text-ink"
                      }`}
                    >
                      {artist.name}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex flex-col gap-6 p-6">
              <Artwork
                src={imageSrc}
                alt={displayArtist.name}
                seedText={displayArtist.name}
                variant="artist"
                className="aspect-[16/8] w-full"
              />

              <div>
                <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                  {displayArtist.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-mono text-[0.75rem] uppercase text-ink-muted">
                    {[
                      detail?.country ?? displayArtist.country,
                      entry.subtitle ?? "Ficha de artista",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDisambigOpen(true)}
                    className="cursor-pointer font-mono text-[0.72rem] text-ink-muted underline underline-offset-4 transition-colors hover:text-acid"
                  >
                    ¿No es este artista? Cambiar
                  </button>
                </div>
                {detail?.syncStatus === "FAILED" && detail.syncError ? (
                  <p className="mt-2 border border-line bg-surface px-2.5 py-1.5 font-mono text-[0.68rem] text-ink-muted">
                    Error de sincronización: {detail.syncError}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 border-y border-line py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_LABELS.map((item) => {
                    const isActive = displayArtist.status === item.value;
                    return (
                      <HairlineButton
                        key={item.value}
                        variant={isActive ? "inverted" : "default"}
                        onClick={() => onStatusArtist(displayArtist.id, item.value)}
                      >
                        {item.label}
                      </HairlineButton>
                    );
                  })}
                </div>
                <RatingControl
                  value={displayArtist.rating}
                  onRate={(value) => onRateArtist(displayArtist.id, value)}
                />
              </div>

              {externalLinks ? (
                <div className="grid grid-cols-3 border border-line">
                  <a
                    href={externalLinks.appleMusic}
                    target="_blank"
                    rel="noreferrer"
                    className="border-r border-line p-3 text-center font-mono text-[0.74rem] uppercase tracking-[0.06em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                  >
                    Apple Music ↗
                  </a>
                  <a
                    href={externalLinks.youtube}
                    target="_blank"
                    rel="noreferrer"
                    className="border-r border-line p-3 text-center font-mono text-[0.74rem] uppercase tracking-[0.06em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                  >
                    YouTube ↗
                  </a>
                  <a
                    href={externalLinks.youtubeLive}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 text-center font-mono text-[0.74rem] uppercase tracking-[0.06em] transition-colors hover:bg-acid hover:font-semibold hover:text-acid-ink"
                  >
                    YouTube Live ↗
                  </a>
                </div>
              ) : null}

              <div>
                <div className="mb-2.5 flex items-center justify-between font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  <span>Notas personales</span>
                  <span>
                    {notesSaveState === "saving"
                      ? "Guardando..."
                      : notesSaveState === "saved"
                        ? "Guardado"
                        : notesSaveState === "error"
                          ? "Error al guardar"
                          : ""}
                  </span>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(event) => handleNotesChange(event.target.value)}
                  onBlur={() => {
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current);
                      debounceRef.current = null;
                    }
                    void flushNotesSave(displayArtist.id, notesDraft);
                  }}
                  placeholder="Sensaciones, discos clave, recordatorios para el concierto..."
                  className="min-h-[84px] w-full resize-y border border-line bg-surface p-3 font-serif text-[1.15rem] text-ink placeholder:text-ink-muted focus:border-acid focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  Biografía
                </div>
                <p className="font-serif text-[1.2rem] leading-[1.42] text-ink">
                  {detail?.bio
                    ? detail.bio
                    : loadingDetail
                      ? "Cargando información..."
                      : "Sin biografía sincronizada todavía."}
                </p>
              </div>

              <div>
                <div className="mb-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  Discografía · Por dónde empezar
                </div>
                {detail && detail.albums.length > 0 ? (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {detail.albums.map((album) => {
                      const albumLinks = getAlbumExternalLinks(displayArtist.name, album.title);
                      const coverSrc = toMediaApiUrl(album.coverPath);
                      return (
                        <div key={album.id} className="flex w-[150px] shrink-0 flex-col gap-2">
                          <div className="relative h-[150px] w-[150px]">
                            <Artwork
                              src={coverSrc}
                              alt={album.title}
                              seedText={`${displayArtist.name}-${album.title}`}
                              variant="album"
                              className="h-[150px] w-[150px]"
                            />
                            <button
                              type="button"
                              onClick={() => void handleTogglePin(album.id, album.isPinned)}
                              className={`absolute top-2 right-2 cursor-pointer border px-1.5 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.06em] ${
                                album.isPinned
                                  ? "border-acid bg-acid font-semibold text-acid-ink"
                                  : "border-[#444] bg-black/85 text-white hover:border-white"
                              }`}
                            >
                              {album.isPinned ? "PIN ★" : "FIJAR"}
                            </button>
                          </div>

                          <div className="font-sans text-[0.86rem] font-semibold leading-[1.2]">
                            {album.title}
                          </div>
                          <div className="font-mono text-[0.7rem] text-ink-muted">
                            {[album.releaseYear, album.releaseType].filter(Boolean).join(" · ")}
                          </div>

                          <div className="flex flex-wrap gap-1 font-mono text-[0.66rem] uppercase">
                            <a
                              href={albumLinks.appleMusic}
                              target="_blank"
                              rel="noreferrer"
                              className="border border-line px-1.5 py-0.5 text-ink-muted hover:border-ink hover:text-ink"
                            >
                              AM ↗
                            </a>
                            <a
                              href={albumLinks.youtube}
                              target="_blank"
                              rel="noreferrer"
                              className="border border-line px-1.5 py-0.5 text-ink-muted hover:border-ink hover:text-ink"
                            >
                              YT ↗
                            </a>
                            {album.customUrl ? (
                              <a
                                href={album.customUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="border border-acid bg-acid px-1.5 py-0.5 font-semibold text-acid-ink"
                              >
                                LINK ↗
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAlbumUrlId(
                                  editingAlbumUrlId === album.id ? null : album.id,
                                );
                                setAlbumUrlDraft(album.customUrl ?? "");
                                setAlbumUrlError(null);
                              }}
                              className="cursor-pointer border border-line px-1.5 py-0.5 text-ink-muted hover:border-ink hover:text-ink"
                            >
                              URL
                            </button>
                          </div>

                          {editingAlbumUrlId === album.id ? (
                            <div className="flex flex-col gap-1 border border-line bg-surface p-2">
                              <input
                                type="url"
                                value={albumUrlDraft}
                                onChange={(event) => setAlbumUrlDraft(event.target.value)}
                                placeholder="https://..."
                                className="w-full border border-line bg-bg px-1.5 py-1 font-mono text-[0.68rem] text-ink outline-none"
                              />
                              {albumUrlError ? (
                                <span className="font-mono text-[0.64rem] text-ink-muted">
                                  {albumUrlError}
                                </span>
                              ) : null}
                              <HairlineButton
                                variant="acid"
                                onClick={() => void handleSaveCustomUrl(album.id)}
                                className="w-full py-1 text-[0.66rem]"
                              >
                                Guardar
                              </HairlineButton>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-xs uppercase text-ink-muted">
                    {loadingDetail
                      ? "Cargando discografía..."
                      : "Sin discos sincronizados todavía."}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  Pase actual & Valoración de directo
                </div>
                <div className="flex flex-col gap-3 border border-line bg-surface p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={dayDraft}
                      onChange={(event) => {
                        setDayDraft(event.target.value);
                        setLiveSaveState("idle");
                      }}
                      placeholder="Día (ej. Viernes 09)"
                      aria-label="Día del concierto"
                      className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink outline-none focus:border-acid"
                    />
                    <input
                      type="text"
                      value={stageDraft}
                      onChange={(event) => {
                        setStageDraft(event.target.value);
                        setLiveSaveState("idle");
                      }}
                      placeholder="Escenario"
                      aria-label="Escenario"
                      className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink outline-none focus:border-acid"
                    />
                    <input
                      type="text"
                      value={timeDraft}
                      onChange={(event) => {
                        setTimeDraft(event.target.value);
                        setLiveSaveState("idle");
                      }}
                      placeholder="Hora (22:30)"
                      aria-label="Hora del pase"
                      className="border border-line bg-bg px-2.5 py-2 font-mono text-xs text-ink outline-none focus:border-acid"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[0.72rem] uppercase text-ink-muted">
                      Nota de directo
                    </span>
                    <RatingControl
                      compact
                      value={liveRatingDraft}
                      onRate={(value) => {
                        setLiveRatingDraft(value);
                        setLiveSaveState("idle");
                      }}
                    />
                  </div>

                  <input
                    type="text"
                    value={liveNotesDraft}
                    onChange={(event) => {
                      setLiveNotesDraft(event.target.value);
                      setLiveSaveState("idle");
                    }}
                    placeholder="¿Qué tal estuvo en directo?"
                    aria-label="Comentario de directo"
                    className="border border-line bg-bg px-3 py-2 font-serif text-base text-ink outline-none focus:border-acid"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[0.7rem] uppercase text-ink-muted">
                      {liveSaveState === "saving"
                        ? "Guardando..."
                        : liveSaveState === "saved"
                          ? "Pase guardado"
                          : liveSaveState === "error"
                            ? (liveSaveError ?? "Error al guardar")
                            : ""}
                    </span>
                    <HairlineButton
                      variant="acid"
                      disabled={liveSaveState === "saving"}
                      onClick={() => void handleSaveEntrySchedule()}
                    >
                      Guardar pase
                    </HairlineButton>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em] text-ink-muted">
                  Historial en festivales
                </div>
                <div className="border-t border-line">
                  {(detail?.festivals ?? []).map((appearance) => (
                    <div
                      key={appearance.entryId}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 font-mono text-[0.76rem]"
                    >
                      <span>
                        {appearance.festivalName} {appearance.festivalYear}
                        {appearance.day ? ` · ${appearance.day}` : ""}
                        {appearance.stage ? ` · ${appearance.stage}` : ""}
                      </span>
                      {appearance.liveRating ? (
                        <span className="border border-acid bg-acid px-2 py-0.5 text-[0.7rem] font-semibold text-acid-ink">
                          DIRECTO {appearance.liveRating}/5
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>

      {displayArtist ? (
        <DisambiguateModal
          open={disambigOpen}
          onClose={() => setDisambigOpen(false)}
          artistId={displayArtist.id}
          artistName={displayArtist.name}
          onDisambiguated={() => {
            void reloadArtistDetail(displayArtist.id);
          }}
        />
      ) : null}
    </>
  );
}
