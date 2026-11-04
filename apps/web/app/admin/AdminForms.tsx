"use client";

import { useState, useTransition } from "react";
import { slugify } from "@evergreen/core";
import { createBusinessAction, deleteBusinessAction, inviteOwnerAction, joinForSupportAction } from "./actions";
import { Dialog } from "../../components/app/Dialog";
import { formObject } from "../../lib/form";

type R = { ok: true; message: string; data?: string } | { ok: false; error: string };

function Result({ r }: { r: R | null }) {
  if (!r) return null;
  if (!r.ok) return <p className="text-sm text-overdue" role="alert">{r.error}</p>;
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-sm">
      <p className="font-semibold">{r.message}</p>
      {r.data && <input className="input mt-2" readOnly value={r.data} onFocus={(e) => e.target.select()} aria-label="Invite link" />}
    </div>
  );
}

export function CreateBusinessForm({ industries }: { industries: { id: string; label: string }[] }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [r, setR] = useState<R | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-4 space-y-3" action={(f) => start(async () => setR(await createBusinessAction(formObject(f))))}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Business name</span><input name="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="label">Booking link name</span><input name="slug" className="input" value={slug} placeholder={slugify(name) || "barclays"} onChange={(e) => setSlug(e.target.value.toLowerCase())} /><span className="mt-1 block text-xs text-muted">/b/{slug || slugify(name) || "..."}</span></label>
        <label className="block">
          <span className="label">Industry</span>
          <select name="industry" className="input" defaultValue="salon">{industries.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
        </label>
        <label className="block">
          <span className="label">Time zone</span>
          <select name="timezone" className="input" defaultValue="America/Los_Angeles">
            {["America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Owner email (optional)</span><input name="ownerEmail" type="email" className="input" /></label>
        <label className="block"><span className="label">Owner title</span><input name="ownerTitle" className="input" placeholder="Owner" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="starterServices" defaultChecked /> Start with the industry&apos;s sample services (editable)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="addMe" defaultChecked /> Add me as an owner so I can set it up</label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating..." : "Create business"}</button>
      <Result r={r} />
    </form>
  );
}

export function InviteOwner({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<R | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn btn-soft btn-sm" onClick={() => setOpen(true)}>Invite owner</button>;
  return (
    <form className="flex w-full flex-wrap items-center gap-2" action={(f) => start(async () => setR(await inviteOwnerAction({ ...formObject(f), workspaceId })))}>
      <input name="email" type="email" className="input w-56 py-1" placeholder="owner@email.com" required aria-label="Owner email" />
      <select name="role" className="input w-auto py-1" aria-label="Access"><option value="owner">Owner</option><option value="manager">Manager</option></select>
      <button className="btn btn-primary btn-sm" disabled={pending}>Send</button>
      <div className="w-full"><Result r={r} /></div>
    </form>
  );
}

export function SupportButton({ workspaceId }: { workspaceId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(() => joinForSupportAction(workspaceId))}>Open for support</button>;
}

type Counts = { appointments: number; clients: number; staff: number; timeEntries: number; services: number };

/** Delete button and confirmation. The server checks the admin, the typed link name and the checkbox again. */
export function DeleteBusiness({ business, counts }: { business: { id: string; name: string; slug: string }; counts: Counts }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [r, setR] = useState<R | null>(null);
  const [pending, start] = useTransition();
  const hasData = counts.appointments > 0 || counts.timeEntries > 0;
  const ready = typed.trim() === business.slug && (!hasData || ack);
  const close = () => {
    setOpen(false);
    setTyped("");
    setAck(false);
    setR(null);
  };
  const rows: [string, number][] = [
    ["Appointments", counts.appointments],
    ["Clients", counts.clients],
    ["Staff", counts.staff],
    ["Time entries", counts.timeEntries],
    ["Services", counts.services],
  ];
  return (
    <>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>Delete</button>
      <Dialog open={open} onClose={close} title={`Delete ${business.name}?`}>
        <form
          className="space-y-4"
          action={() =>
            start(async () => {
              const res = await deleteBusinessAction({ workspaceId: business.id, confirmSlug: typed, acknowledgeData: ack });
              setR(res);
              if (res.ok) setOpen(false);
            })
          }
        >
          <p className="text-sm">This permanently removes the business and everything below. It cannot be undone.</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm">
            {rows.map(([label, n]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="text-right font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
          {hasData && (
            <div className="rounded-lg border border-overdue p-3 text-sm" role="alert">
              <p className="font-semibold text-overdue">This business has real history.</p>
              <p className="mt-1">Its {counts.appointments} appointments and {counts.timeEntries} time entries (used for payroll) will be lost for good.</p>
              <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" /> I understand these records will be permanently deleted.</label>
            </div>
          )}
          <label className="block">
            <span className="label">Type <strong>{business.slug}</strong> to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </label>
          <Result r={r} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" disabled={!ready || pending}>{pending ? "Deleting..." : "Delete business"}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
