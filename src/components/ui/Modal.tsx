"use client";

import { type ReactNode, useId } from "react";
import { useDialog } from "@/components/ui/useDialog";
import { useI18n } from "@/i18n/context";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const { dict } = useI18n();
  const dialogRef = useDialog(open, onClose);
  const titleId = useId();
  const closedByProps = { closedby: "any" } as Record<string, string>;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className="kue-modal" {...closedByProps}>
      <div className="flex h-[50px] shrink-0 items-stretch justify-between border-b border-line bg-bg">
        <h2
          id={titleId}
          className="flex items-center px-[18px] font-mono text-[0.76rem] font-semibold uppercase tracking-[0.08em]"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="cursor-pointer border-l border-line px-5 font-mono text-[0.74rem] uppercase transition-colors hover:bg-acid hover:text-acid-ink"
        >
          {dict.common.close}
        </button>
      </div>
      <div className="overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
