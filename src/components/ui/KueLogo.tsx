import Link from "next/link";

interface KueLogoProps {
  href?: string;
  className?: string;
}

export function KueLogo({ href = "/", className = "" }: KueLogoProps) {
  return (
    <Link
      href={href}
      aria-label="KUE — Inicio"
      className={`flex select-none items-center border-r border-line px-[22px] font-display text-[1.55rem] font-extrabold uppercase leading-none tracking-[-0.04em] transition-colors hover:bg-acid hover:text-acid-ink ${className}`}
    >
      KUE
    </Link>
  );
}
