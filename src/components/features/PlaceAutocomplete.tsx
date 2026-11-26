"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlaceCandidate } from "@/domain/schemas";

interface PlaceAutocompleteProps {
  id: string;
  value: string;
  selectedPlace: PlaceCandidate | null;
  onInputChange: (value: string) => void;
  onSelectPlace: (place: PlaceCandidate | null) => void;
  invalid?: boolean;
  describedBy?: string;
}

function formatPlaceMeta(place: PlaceCandidate): string {
  const parts: string[] = [];
  for (const part of [place.province, place.region, place.country]) {
    if (part && part !== place.name && !parts.includes(part)) {
      parts.push(part);
    }
  }
  return parts.join(" · ");
}

export function PlaceAutocomplete({
  id,
  value,
  selectedPlace,
  onInputChange,
  onSelectPlace,
  invalid = false,
  describedBy,
}: PlaceAutocompleteProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = value.trim();
    if (selectedPlace || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setFetchError(null);
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      setIsOpen(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { places?: PlaceCandidate[]; error?: string };
        if (!res.ok) {
          setResults([]);
          setFetchError(data.error ?? "No se pudieron buscar lugares");
          setIsOpen(true);
          return;
        }
        const nextPlaces = data.places ?? [];
        setResults(nextPlaces);
        setActiveIndex(nextPlaces.length > 0 ? 0 : -1);
        setIsOpen(true);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setResults([]);
        setFetchError("Error de conexión buscando lugares");
        setIsOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, selectedPlace]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const choosePlace = (place: PlaceCandidate) => {
    onSelectPlace(place);
    onInputChange(place.name);
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (!isOpen || results.length === 0) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      choosePlace(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && results[activeIndex]
      ? `${listboxId}-opt-${results[activeIndex].placeId}`
      : undefined;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          id={id}
          name="location"
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            onInputChange(event.target.value);
            if (selectedPlace) {
              onSelectPlace(null);
            }
          }}
          onFocus={() => {
            if (!selectedPlace && (results.length > 0 || fetchError)) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ciudad (ej. La Haya)"
          className={`w-full border bg-bg px-3 py-2 pr-8 font-sans text-sm text-ink outline-none focus-visible:border-acid ${
            invalid ? "border-acid" : "border-line"
          }`}
        />
        {value.length > 0 ? (
          <button
            type="button"
            aria-label="Limpiar ubicación"
            onClick={() => {
              onSelectPlace(null);
              onInputChange("");
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-2 cursor-pointer px-1 font-mono text-xs text-ink-muted hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Sugerencias de ubicación"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto border border-line-strong bg-bg shadow-lg"
        >
          {loading ? (
            <div className="px-3 py-2 font-mono text-xs text-ink-muted">Buscando lugares...</div>
          ) : fetchError ? (
            <div className="px-3 py-2 font-mono text-xs text-ink-muted">{fetchError}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 font-mono text-xs text-ink-muted">
              Sin resultados para &ldquo;{value.trim()}&rdquo;
            </div>
          ) : (
            results.map((place, index) => {
              const isActive = index === activeIndex;
              const meta = formatPlaceMeta(place);
              return (
                <button
                  key={place.placeId}
                  type="button"
                  id={`${listboxId}-opt-${place.placeId}`}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choosePlace(place)}
                  className={`block w-full cursor-pointer border-b border-line px-3 py-2 text-left last:border-b-0 ${
                    isActive ? "bg-acid text-acid-ink" : "text-ink hover:bg-surface"
                  }`}
                >
                  <div className="font-sans text-sm font-semibold leading-tight">{place.name}</div>
                  {meta ? (
                    <div
                      className={`mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.04em] ${
                        isActive ? "text-acid-ink/80" : "text-ink-muted"
                      }`}
                    >
                      {meta}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
