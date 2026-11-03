"use client";

import { useEffect, useRef } from "react";
import { IconX } from "./Icons";

/** Native dialog: focus trap, Escape to close and a backdrop for free. Full width sheet on phones. */
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`m-auto max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-line p-0 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">{title}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><IconX /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
