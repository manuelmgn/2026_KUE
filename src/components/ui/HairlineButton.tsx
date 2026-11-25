import type { ButtonHTMLAttributes } from "react";

type HairlineVariant = "default" | "acid" | "inverted" | "ghost";
type HairlineSize = "sm" | "md";

export interface HairlineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: HairlineVariant;
  size?: HairlineSize;
}

const VARIANT_CLASSES: Record<HairlineVariant, string> = {
  default: "border border-line bg-transparent text-ink-muted hover:border-ink hover:text-ink",
  acid: "border border-acid bg-acid font-semibold text-acid-ink hover:opacity-90",
  inverted: "border border-ink bg-ink text-bg",
  ghost:
    "border border-transparent bg-transparent text-ink-muted hover:bg-surface-elevated hover:text-ink",
};

const SIZE_CLASSES: Record<HairlineSize, string> = {
  sm: "px-2.5 py-1.5 text-[0.72rem]",
  md: "px-4 py-2.5 text-[0.76rem]",
};

export function HairlineButton({
  variant = "default",
  size = "sm",
  type = "button",
  className = "",
  ...props
}: HairlineButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-mono uppercase tracking-[0.07em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
