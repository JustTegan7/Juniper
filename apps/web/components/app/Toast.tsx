"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "ok" | "error"; action?: ToastAction };
type Push = (text: string, tone?: Toast["tone"], action?: ToastAction) => void;
const Ctx = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<Push>(
    (text, tone = "ok", action) => {
      if (!text) return;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
      // Toasts with an Undo stay a little longer so there is time to press it.
      setTimeout(() => remove(id), action ? 6000 : 4000);
    },
    [remove],
  );
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${t.tone === "error" ? "bg-overdue text-white" : "bg-primary text-primary-fg"}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-md border border-current px-2 py-0.5 hover:opacity-80"
                onClick={() => {
                  remove(t.id);
                  t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
