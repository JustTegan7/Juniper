"use client";

import { useState } from "react";
import type { WeeklyHours } from "@evergreen/core";
import { deleteOverrideAction, inviteAction, removeMemberAction, revokeInviteAction, saveOverrideAction, saveStaffHoursAction, updateMemberAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { WeekHoursEditor } from "../../../components/app/WeekHoursEditor";
import { formObject } from "../../../lib/form";

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => { setLink(null); setOpen(true); }}>Invite someone</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite to the team">
        {link ? (
          <div className="space-y-3 text-sm">
            <p>Email is not set up yet. Send this link to them by text or another way. It works for 14 days and only for that email.</p>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button type="button" className="btn btn-soft btn-sm" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
          </div>
        ) : (
          <form className="space-y-3" action={(f) => act(() => inviteAction(formObject(f)), (r) => (r.data ? setLink(r.data) : setOpen(false)))}>
            <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" required /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Access</span>
                <select name="role" className="input" defaultValue="member">
                  <option value="member">Team member</option>
                  <option value="manager">Manager</option>
                  {canInviteOwner && <option value="owner">Owner</option>}
                </select>
              </label>
              <label className="block"><span className="label">Job title</span><input name="title" className="input" placeholder="Stylist" /></label>
            </div>
            <p className="text-xs text-muted">Team members see the calendar, book on their own column, clock in and out, and request time off. Managers run the whole schedule, approve time off and fix timesheets.</p>
            <div className="flex justify-end"><button className="btn btn-primary" disabled={pending}>Send invite</button></div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const { act, pending } = useAct();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => revokeInviteAction({ id }))}>Cancel invite</button>;
}

type M = { membershipId: string; name: string; role: "owner" | "manager" | "member"; title: string; bio: string; color: string; bookable: boolean; bookableOnline: boolean; sortOrder: number };

export function MemberEditor({ member, isOwner, isSelf, staffLabel }: { member: M; isOwner: boolean; isSelf: boolean; staffLabel: string }) {
  const [open, setOpen] = useState(false);
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Edit</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={member.name}>
        <form
          className="space-y-3"
          action={(f) => {
            const o = formObject(f);
            act(
              () =>
                updateMemberAction({
                  membershipId: member.membershipId,
                  title: o.title,
                  bio: o.bio,
                  color: o.color,
                  sortOrder: Number(o.sortOrder ?? 0),
                  bookable: o.bookable === "on",
                  bookableOnline: o.bookableOnline === "on",
                  ...(isOwner && !isSelf ? { role: o.role } : {}),
                }),
              () => setOpen(false),
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">Job title</span><input name="title" className="input" defaultValue={member.title} placeholder={staffLabel} /></label>
            <label className="block">
              <span className="label">Access</span>
              <select name="role" className="input" defaultValue={member.role} disabled={!isOwner || isSelf}>
                <option value="member">Team member</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <label className="block"><span className="label">Calendar color</span><input name="color" type="color" className="input h-10 p-1" defaultValue={member.color} /></label>
            <label className="block"><span className="label">Order on calendar</span><input name="sortOrder" type="number" min={0} max={999} className="input" defaultValue={member.sortOrder} /></label>
          </div>
          <label className="block"><span className="label">Short bio shown online (optional)</span><textarea name="bio" rows={2} className="input" defaultValue={member.bio} maxLength={600} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bookable" defaultChecked={member.bookable} /> Takes appointments (has a calendar column)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bookableOnline" defaultChecked={member.bookableOnline} /> Clients can book them online</label>
          <div className="flex justify-between gap-2">
            {isOwner && !isSelf ? (
              <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(() => removeMemberAction({ membershipId: member.membershipId }), () => setOpen(false))}>Remove from team</button>
            ) : <span />}
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function StaffHours({ membershipId, initial }: { membershipId: string; initial: WeeklyHours[] }) {
  return <WeekHoursEditor key={membershipId} initial={initial} onSave={(windows) => saveStaffHoursAction({ membershipId, windows })} saveLabel="Save schedule" />;
}

export function OverrideForm({ membershipId, today }: { membershipId: string; today: string }) {
  const [off, setOff] = useState(true);
  const { act, pending } = useAct();
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3" action={(f) => act(() => saveOverrideAction({ ...formObject(f), membershipId }))}>
      <label className="block"><span className="label">Day</span><input type="date" name="day" className="input py-1" min={today} defaultValue={today} required /></label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="off" checked={off} onChange={(e) => setOff(e.target.checked)} /> Off</label>
      {!off && (
        <>
          <label className="block"><span className="label">From</span><input type="time" name="start" className="input py-1" required /></label>
          <label className="block"><span className="label">To</span><input type="time" name="end" className="input py-1" required /></label>
        </>
      )}
      <label className="block"><span className="label">Note</span><input name="note" className="input py-1" placeholder="Covering Saturday" /></label>
      <button className="btn btn-soft btn-sm" disabled={pending}>Add change</button>
    </form>
  );
}

export function RemoveOverride({ id }: { id: string }) {
  const { act, pending } = useAct();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => act(() => deleteOverrideAction({ id }))}>Remove</button>;
}
