"use client";

import { useEffect, useState } from "react";
import { disambiguateArtistAction } from "@/actions/artist-actions";
import { HairlineButton } from "@/components/ui/HairlineButton";
import { Modal } from "@/components/ui/Modal";
import type { MusicBrainzArtistCandidate } from "@/domain/schemas";

interface DisambiguateModalProps {
  open: boolean;
  onClose: () => void;
  artistId: string;
  artistName: string;
  onDisambiguated: () => void;
}

async function fetchCandidates(term: string): Promise<MusicBrainzArtistCandidate[]> {
  const response = await fetch(`/api/disambiguate?q=${encodeURIComponent(term)}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "No se pudo consultar MusicBrainz");
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
  const [query, setQuery] = useState(artistName);
  const [candidates, setCandidates] = useState<MusicBrainzArtistCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await fetchCandidates(trimmed);
      setCandidates(results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error de conexión con MusicBrainz");
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setQuery(artistName);
    setLoading(true);
    setError(null);
    void fetchCandidates(artistName)
      .then((results) => {
        if (!cancelled) {
          setCandidates(results);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error de conexión con MusicBrainz");
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, artistName]);

  const handleSelect = async (candidate: MusicBrainzArtistCandidate) => {
    setSavingId(candidate.id);
    setError(null);
    try {
      await disambiguateArtistAction({
        artistId,
        mbid: candidate.id,
        country: candidate.country ?? null,
      });
      onDisambiguated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el artista");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Desambiguar en MusicBrainz">
      <div className="flex flex-col gap-4">
        <p className="font-serif text-[1.1rem] text-ink-muted">
          Selecciona el artista correcto. Tus notas, valoración y festivales se conservan intactos.
        </p>

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
            placeholder="Buscar término alternativo..."
            aria-label="Término de búsqueda en MusicBrainz"
            className="flex-1 bg-surface px-3 py-2 font-sans text-sm text-ink outline-none"
          />
          <HairlineButton
            type="submit"
            variant="acid"
            size="md"
            disabled={loading}
            className="border-0 border-l border-line"
          >
            {loading ? "Buscando..." : "Buscar"}
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
              Sin candidatos para esta búsqueda.
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
                    .join(" · ") || "Sin descripción adicional"}
                </div>
              </div>
              <span className="shrink-0 border border-line px-2.5 py-1 font-mono text-[0.7rem] uppercase">
                {savingId === candidate.id ? "Guardando..." : "Elegir"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
