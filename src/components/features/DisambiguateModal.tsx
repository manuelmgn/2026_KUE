"use client";

import { useEffect, useRef, useState } from "react";
import { disambiguateArtistAction } from "@/actions/artist-actions";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { Modal } from "@/components/ui/Modal";
import type { MusicBrainzArtistCandidate } from "@/domain/schemas";
import { useI18n } from "@/i18n/context";

interface DisambiguateModalProps {
  open: boolean;
  onClose: () => void;
  artistId: string;
  artistName: string;
  onDisambiguated: () => void;
}

async function fetchCandidates(
  term: string,
  signal: AbortSignal,
  fallbackError: string,
): Promise<MusicBrainzArtistCandidate[]> {
  const response = await fetch(`/api/disambiguate?q=${encodeURIComponent(term)}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? fallbackError);
  }
  const data = (await response.json()) as { candidates: MusicBrainzArtistCandidate[] };
  return data.candidates;
}

export function DisambiguateModal({
  open,
  onClose,
  artistId,
  artistName,
  onDisambiguated,
}: DisambiguateModalProps) {
  const { dict } = useI18n();
  const [query, setQuery] = useState(artistName);
  const [candidates, setCandidates] = useState<MusicBrainzArtistCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const results = await fetchCandidates(
        trimmed,
        controller.signal,
        dict.disambiguate.fetchError,
      );
      if (!controller.signal.aborted) {
        setCandidates(results);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setError(err instanceof Error ? err.message : dict.disambiguate.connectionError);
      setCandidates([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setQuery(artistName);
    setLoading(true);
    setError(null);

    void fetchCandidates(artistName, controller.signal, dict.disambiguate.fetchError)
      .then((results) => {
        if (!controller.signal.aborted) {
          setCandidates(results);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : dict.disambiguate.connectionError);
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, artistName, dict.disambiguate.fetchError, dict.disambiguate.connectionError]);

  const handleSelect = async (candidate: MusicBrainzArtistCandidate) => {
    setSavingId(candidate.id);
    setError(null);
    try {
      const res = await disambiguateArtistAction({
        artistId,
        mbid: candidate.id,
        country: candidate.country ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDisambiguated();
      onClose();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={dict.disambiguate.title}>
      <div className="flex flex-col gap-4">
        <p className="font-serif text-[1.1rem] text-ink-muted">{dict.disambiguate.description}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query);
          }}
          className="flex border border-line"
        >
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dict.disambiguate.searchPlaceholder}
            aria-label={dict.disambiguate.searchAria}
            className="flex-1 bg-surface px-3 py-2 font-sans text-sm text-ink outline-none"
          />
          <HairlineButton
            type="submit"
            variant="acid"
            size="md"
            disabled={loading}
            className="border-0 border-l border-line"
          >
            {loading ? dict.common.searching : dict.common.search}
          </HairlineButton>
        </form>

        {error ? (
          <p role="alert" className="border border-line bg-surface p-3 font-mono text-xs text-ink">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col border-t border-line">
          {!loading && candidates.length === 0 && !error ? (
            <p className="py-6 font-mono text-xs uppercase text-ink-muted">
              {dict.disambiguate.noCandidates}
            </p>
          ) : null}

          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={savingId !== null}
              onClick={() => void handleSelect(candidate)}
              className="flex cursor-pointer items-center justify-between gap-4 border-b border-line px-3 py-3.5 text-left transition-colors hover:bg-surface disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="font-display text-base font-bold text-ink">{candidate.name}</div>
                <div className="mt-1 font-mono text-[0.72rem] uppercase text-ink-muted">
                  {[candidate.country, candidate.type, candidate.disambiguation]
                    .filter(Boolean)
                    .join(" · ") || dict.disambiguate.noAdditionalDescription}
                </div>
              </div>
              <span className="shrink-0 border border-line px-2.5 py-1 font-mono text-[0.7rem] uppercase">
                {savingId === candidate.id ? dict.common.saving : dict.common.choose}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
