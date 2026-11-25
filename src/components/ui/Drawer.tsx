"use client";

import type { ReactNode } from "react";
import { useDialog } from "@/components/ui/useDialog";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  headerLabel: string;
  ariaLabel: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, headerLabel, ariaLabel, children }: DrawerProps) {
  const dialogRef = useDialog(open, onClose);
  const closedByProps = { closedby: "any" } as Record<string, string>;

  return (
    <dialog ref={dialogRef} aria-label={ariaLabel} className="kue-drawer" {...closedByProps}>
      <div className="sticky top-0 z-10 flex h-[50px] shrink-0 items-stretch justify-between border-b border-line bg-bg">
        <div className="flex items-center px-[18px] font-mono text-[0.74rem] uppercase tracking-[0.08em] text-ink-muted">
          {headerLabel}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="cursor-pointer border-l border-line px-5 font-mono text-[0.76rem] uppercase transition-colors hover:bg-acid hover:text-acid-ink"
        >
          Cerrar [ESC]
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </dialog>
  );
}
