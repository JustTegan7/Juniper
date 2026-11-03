"use client";

import { useState } from "react";
import { cancelTimeOffAction, requestTimeOffAction, reviewTimeOffAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";

export function RequestForm({ today, members, myId }: { today: string; members: { id: string; name: string }[]; myId: string }) {
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState(today);
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{members.length ? "Add time off" : "Request time off"}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={members.length ? "Add time off" : "Request time off"}>
        <form className="space-y-3" action={(f) => act(() => requestTimeOffAction(formObject(f)), () => setOpen(false))}>
          {members.length > 0 && (
            <label className="block">
              <span className="label">For</span>
              <select name="membershipId" className="input" defaultValue={myId}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === myId ? " (you)" : ""}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted">Time off you add for someone else is approved right away.</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">First day</span><input type="date" name="startDay" className="input" value={start} min={members.length ? undefined : today} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="block"><span className="label">Last day</span><input type="date" name="endDay" className="input" defaultValue={today} min={start} required key={start} /></label>
            {!allDay && (
              <>
                <label className="block"><span className="label">From</span><input type="time" name="startTime" className="input" required /></label>
                <label className="block"><span className="label">Until</span><input type="time" name="endTime" className="input" required /></label>
              </>
            )}
          </div>
          <label className="block"><span className="label">Note (optional)</span><input name="reason" className="input" maxLength={500} /></label>
          <div className="flex justify-end"><button className="btn btn-primary" disabled={pending}>{pending ? "Sending..." : "Send"}</button></div>
        </form>
      </Dialog>
    </>
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const { act, pending } = useAct();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input w-40 py-1 text-sm" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(() => reviewTimeOffAction({ id, decision: "approved", note }))}>Approve</button>
      <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(() => reviewTimeOffAction({ id, decision: "denied", note }))}>Deny</button>
    </div>
  );
}

export function CancelButton({ id }: { id: string }) {
  const { act, pending } = useAct();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => cancelTimeOffAction({ id }))}>Cancel</button>;
}
