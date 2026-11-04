"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveClientAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";

type C = { id: string; firstName: string; lastName: string; email: string | null; phone: string; notes: string | null };

export function ClientForm({ label, client, onDelete }: { label: string; client?: C; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className={client ? "btn btn-soft btn-sm" : "btn btn-primary"} onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <form
          className="space-y-3"
          action={(f) =>
            act(
              () => saveClientAction(formObject(f)),
              (r) => {
                setOpen(false);
                if (!client && r.id) router.push(`/clients/${r.id}`);
              },
            )
          }
        >
          {client && <input type="hidden" name="id" value={client.id} />}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">First name</span><input name="firstName" className="input" defaultValue={client?.firstName} required /></label>
            <label className="block"><span className="label">Last name</span><input name="lastName" className="input" defaultValue={client?.lastName} /></label>
            <label className="block"><span className="label">Phone</span><input name="phone" type="tel" className="input" defaultValue={client?.phone} /></label>
            <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" defaultValue={client?.email ?? ""} /></label>
          </div>
          <label className="block"><span className="label">Notes (formulas, preferences)</span><textarea name="notes" rows={4} className="input" defaultValue={client?.notes ?? ""} /></label>
          <div className="flex items-center justify-between gap-2">
            {client && onDelete ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
