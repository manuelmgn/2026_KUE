"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  headerLabel: string;
  ariaLabel: string;
  children: ReactNode;
}

function isPointerOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function Drawer({ open, onClose, headerLabel, ariaLabel, children }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };
    dialog.addEventListener("close", handleClose);

    // Light-dismiss fallback for browsers without native `closedby` (e.g. Safari)
    const supportsClosedBy = "closedBy" in HTMLDialogElement.prototype;
    let pressedOutside = false;

    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isPointerOutsideDialog(event, dialog);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    if (!supportsClosedBy) {
      dialog.addEventListener("pointerdown", handlePointerDown);
      dialog.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      if (!supportsClosedBy) {
        dialog.removeEventListener("pointerdown", handlePointerDown);
        dialog.removeEventListener("pointerup", handlePointerUp);
      }
    };
  }, [onClose]);

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
