"use client";

import { useState, useTransition } from "react";
import { slugify } from "@evergreen/core";
import { createBusinessAction, inviteOwnerAction, joinForSupportAction } from "./actions";
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
