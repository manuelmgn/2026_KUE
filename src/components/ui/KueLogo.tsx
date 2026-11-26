"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";

interface KueLogoProps {
  href?: string;
  className?: string;
}

export function KueLogo({ href = "/", className = "" }: KueLogoProps) {
  const { dict } = useI18n();
  return (
    <Link
      href={href}
      aria-label={dict.nav.logoAria}
      className={`flex shrink-0 select-none items-center border-r border-line px-3.5 font-display text-[1.3rem] font-extrabold uppercase leading-none tracking-[-0.04em] transition-colors hover:bg-acid hover:text-acid-ink md:px-[22px] md:text-[1.55rem] ${className}`}
    >
      KUE
    </Link>
  );
}
