"use client";
import { useEffect, useRef } from "react";

/**
 * Modal built on <dialog>: focus is trapped by the browser, Escape closes it,
 * and focus returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={() => {
        onClose();
        opener.current?.focus();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border-2 border-ink bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="p-6">
        <h2 id="dialog-title" className="text-xl font-semibold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
