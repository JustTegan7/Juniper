"use client";

import { useState } from "react";
import { deleteEntryAction, saveEntryAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";

type Entry = { id: string; day: string; clockIn: string; clockOut: string; note: string; mealStart: string; mealEnd: string };

/** Manager form to add or fix a shift. The meal break fields replace the first recorded meal break. */
export function EntryEditor({ membershipId, members, defaultDay, label, entry }: { membershipId: string; members: { id: string; name: string }[]; defaultDay: string; label: string; entry?: Entry }) {
  const [open, setOpen] = useState(false);
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className={entry ? "btn btn-ghost btn-sm" : "btn btn-soft btn-sm"} onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={entry ? "Edit shift" : "Add a shift"}>
        <form className="space-y-3" action={(f) => act(() => saveEntryAction(formObject(f)), () => setOpen(false))}>
          {entry && <input type="hidden" name="id" value={entry.id} />}
          <label className="block">
            <span className="label">Person</span>
            <select name="membershipId" className="input" defaultValue={membershipId}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Day</span><input type="date" name="day" className="input" defaultValue={entry?.day ?? defaultDay} required /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">Clock in</span><input type="time" name="clockIn" className="input" defaultValue={entry?.clockIn} required /></label>
            <label className="block"><span className="label">Clock out</span><input type="time" name="clockOut" className="input" defaultValue={entry?.clockOut} /></label>
            <label className="block"><span className="label">Meal break start</span><input type="time" name="mealStart" className="input" defaultValue={entry?.mealStart} /></label>
            <label className="block"><span className="label">Meal break end</span><input type="time" name="mealEnd" className="input" defaultValue={entry?.mealEnd} /></label>
          </div>
          {entry && <p className="text-xs text-muted">Leave the meal break blank to remove it. Rest breaks punched on the clock stay as they are.</p>}
          <label className="block"><span className="label">Reason for the change</span><input name="note" className="input" defaultValue={entry?.note} placeholder="Forgot to clock out" /></label>
          <div className="flex justify-between gap-2">
            {entry ? (
              <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(() => deleteEntryAction({ id: entry.id }), () => setOpen(false))}>Remove shift</button>
            ) : <span />}
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
