"use client";

import { useEffect, useState } from "react";
import { formatHours, formatTimeIn } from "@evergreen/core";
import { clockInAction, clockOutAction, endBreakAction, startBreakAction } from "../actions";
import { useAct } from "../../../components/app/useAct";

export interface ClockState {
  clockIn: string | null;
  openBreak: { kind: "meal" | "rest"; startsAt: string } | null;
  breakMinutes: number;
}

/** Clock in, breaks and clock out for the signed-in person. */
export function ClockWidget({ state, tz, compact = false }: { state: ClockState; tz: string; compact?: boolean }) {
  const { act, pending } = useAct();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!state.clockIn) {
    return (
      <div className={compact ? "" : "card p-5"}>
        <p className="text-sm text-muted">You are clocked out.</p>
        <button type="button" className="btn btn-primary mt-3 w-full py-3 text-base sm:w-auto" disabled={pending} onClick={() => act(() => clockInAction())}>
          Clock in
        </button>
      </div>
    );
  }
  const minutes = Math.max(0, Math.round((now - new Date(state.clockIn).getTime()) / 60_000));
  return (
    <div className={compact ? "" : "card p-5"}>
      <p className="text-sm text-muted">
        Clocked in at {formatTimeIn(new Date(state.clockIn), tz)} · <span className="font-semibold text-fg">{formatHours(minutes)}</span> so far
      </p>
      {state.openBreak && (
        <p className="mt-1 text-sm font-semibold text-today">
          On a {state.openBreak.kind} break since {formatTimeIn(new Date(state.openBreak.startsAt), tz)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {state.openBreak ? (
          <button type="button" className="btn btn-primary py-3" disabled={pending} onClick={() => act(() => endBreakAction())}>End break</button>
        ) : (
          <>
            <button type="button" className="btn btn-soft py-3" disabled={pending} onClick={() => act(() => startBreakAction({ kind: "meal" }))}>Start meal break</button>
            <button type="button" className="btn btn-soft py-3" disabled={pending} onClick={() => act(() => startBreakAction({ kind: "rest" }))}>Start rest break</button>
          </>
        )}
        <button type="button" className="btn btn-danger py-3" disabled={pending} onClick={() => act(() => clockOutAction())}>Clock out</button>
      </div>
    </div>
  );
}
