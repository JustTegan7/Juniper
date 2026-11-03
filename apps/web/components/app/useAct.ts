"use client";

import { useCallback, useTransition } from "react";
import type { ActionResult } from "../../app/(app)/actions";
import { useToast } from "./Toast";

/** Shows an action's result as a toast. The Toast supports an action button (for example Undo) when an app needs one. */
export function useResultToast() {
  const toast = useToast();
  return useCallback(
    (r: ActionResult) => {
      if (!r.ok) return toast(r.error, "error");
      toast(r.message, "ok");
    },
    [toast],
  );
}

/** Runs a server action and shows its message as a toast. */
export function useAct() {
  const show = useResultToast();
  const [pending, start] = useTransition();
  function act(fn: () => Promise<ActionResult>, onOk?: (r: Extract<ActionResult, { ok: true }>) => void, onError?: (r: Extract<ActionResult, { ok: false }>) => void) {
    start(async () => {
      const r = await fn();
      show(r);
      if (r.ok) onOk?.(r);
      else onError?.(r);
    });
  }
  return { act, pending };
}
