"use client";

import type { ReactNode } from "react";
import { useDialog } from "@/components/ui/useDialog";
import { useI18n } from "@/i18n/context";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  headerLabel: string;
  ariaLabel: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, headerLabel, ariaLabel, children }: DrawerProps) {
  const { dict } = useI18n();
  const dialogRef = useDialog(open, onClose);
  const closedByProps = { closedby: "any" } as Record<string, string>;

  return (
    <dialog ref={dialogRef} aria-label={ariaLabel} className="kue-drawer" {...closedByProps}>
      <div className="sticky top-0 z-10 flex h-[50px] shrink-0 items-stretch justify-between border-b border-line bg-bg">
        <div className="flex min-w-0 flex-1 items-center px-4 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-muted sm:px-[18px] sm:text-[0.74rem]">
          <span className="truncate">{headerLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="shrink-0 cursor-pointer border-l border-line px-4 font-mono text-[0.74rem] uppercase transition-colors hover:bg-acid hover:text-acid-ink sm:px-5 sm:text-[0.76rem]"
        >
          <span className="sm:hidden">{dict.common.close}</span>
          <span className="hidden sm:inline">{dict.common.closeEsc}</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </dialog>
  );
}
