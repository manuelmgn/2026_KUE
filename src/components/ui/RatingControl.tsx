"use client";

interface RatingControlProps {
  value: number | null;
  onRate: (rating: number) => void;
  onDiscard?: () => void;
  isDiscarded?: boolean;
  compact?: boolean;
}

const STEPS = [1, 2, 3, 4, 5] as const;

export function RatingControl({
  value,
  onRate,
  onDiscard,
  isDiscarded = false,
  compact = false,
}: RatingControlProps) {
  const sizeClass = compact ? "h-7 w-7 text-[0.74rem]" : "h-8 min-w-8 px-2.5 text-[0.74rem]";

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step) => {
        const isActive = value === step;
        const activeClass = isActive
          ? step >= 4
            ? "border-acid bg-acid font-semibold text-acid-ink"
            : "border-ink bg-ink text-bg"
          : "border-line text-ink-muted hover:border-ink hover:text-ink";

        return (
          <button
            key={step}
            type="button"
            aria-label={`Puntuar ${step} de 5`}
            aria-pressed={isActive}
            onClick={(event) => {
              event.stopPropagation();
              onRate(step);
            }}
            className={`grid cursor-pointer place-items-center border font-mono transition-colors ${sizeClass} ${activeClass}`}
          >
            {step}
          </button>
        );
      })}
      {onDiscard ? (
        <button
          type="button"
          aria-label="Descartar artista"
          aria-pressed={isDiscarded}
          onClick={(event) => {
            event.stopPropagation();
            onDiscard();
          }}
          className={`grid cursor-pointer place-items-center border font-mono transition-colors ${sizeClass} ${
            isDiscarded
              ? "border-ink bg-ink text-bg"
              : "border-line text-ink-muted hover:border-ink hover:text-ink"
          }`}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
