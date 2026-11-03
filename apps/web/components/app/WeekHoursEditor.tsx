"use client";

import { useState } from "react";
import { toHm, WEEKDAYS, type WeeklyHours } from "@evergreen/core";
import type { ActionResult } from "../../app/(app)/actions";
import { useAct } from "./useAct";

type Row = { weekday: number; start: string; end: string };

/** Weekly hours, Monday first, with split shifts. Used for business hours and each person's schedule. */
export function WeekHoursEditor({ initial, onSave, saveLabel = "Save hours" }: { initial: WeeklyHours[]; onSave: (windows: Row[]) => Promise<ActionResult>; saveLabel?: string }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((w) => ({ weekday: w.weekday, start: toHm(w.start), end: toHm(w.end) })));
  const { act, pending } = useAct();
  const order = [1, 2, 3, 4, 5, 6, 0];
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-2">
      {order.map((wd) => {
        const mine = rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === wd);
        return (
          <div key={wd} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
            <span className="w-24 text-sm font-semibold">{WEEKDAYS[wd]}</span>
            {mine.length === 0 && <span className="text-sm text-muted">Off</span>}
            {mine.map(({ r, i }) => (
              <span key={i} className="flex items-center gap-1">
                <input type="time" className="input w-28 py-1" value={r.start} onChange={(e) => set(i, { start: e.target.value })} aria-label={`${WEEKDAYS[wd]} start`} />
                <span className="text-muted">to</span>
                <input type="time" className="input w-28 py-1" value={r.end} onChange={(e) => set(i, { end: e.target.value })} aria-label={`${WEEKDAYS[wd]} end`} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove">x</button>
              </span>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => [...rs, { weekday: wd, start: mine.length ? "14:00" : "09:00", end: mine.length ? "18:00" : "17:00" }])}>
              {mine.length ? "+ Split shift" : "+ Add hours"}
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(() => onSave(rows))}>{saveLabel}</button>
    </div>
  );
}
