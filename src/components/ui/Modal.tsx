"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
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

export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
    <dialog ref={dialogRef} aria-labelledby={titleId} className="kue-modal" {...closedByProps}>
      <div className="flex h-[50px] shrink-0 items-stretch justify-between border-b border-line bg-bg">
        <h1
          id={titleId}
          className="flex items-center px-[18px] font-mono text-[0.76rem] font-semibold uppercase tracking-[0.08em]"
        >
          {title}
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="cursor-pointer border-l border-line px-5 font-mono text-[0.74rem] uppercase transition-colors hover:bg-acid hover:text-acid-ink"
        >
          Cerrar
        </button>
      </div>
      <div className="overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
