"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteClientAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { ClientForm } from "./ClientForm";

type C = { id: string; firstName: string; lastName: string; email: string | null; phone: string; notes: string | null };
type Summary = { past: number; upcoming: number; cancelled: number; total: number };

/**
 * Edit and Delete for one client. Delete is only offered to owners and managers (canDelete),
 * but that is a convenience: the server action and the service check the role again.
 */
export function ClientActions({ client, name, clientWord, canDelete, summary }: { client: C; name: string; clientWord: string; canDelete: boolean; summary: Summary | null }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const router = useRouter();
  const { act, pending } = useAct();
  const showDelete = canDelete && summary !== null;
  const needsAck = (summary?.upcoming ?? 0) > 0;
  const close = () => {
    setOpen(false);
    setAck(false);
  };
  return (
    <>
      <ClientForm label="Edit" client={client} onDelete={showDelete ? () => setOpen(true) : undefined} />
      {showDelete && summary && (
        <>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>Delete</button>
          <Dialog open={open} onClose={close} title={`Delete ${name}?`}>
            <form
              className="space-y-4"
              action={() =>
                act(
                  () => deleteClientAction({ id: client.id, acknowledgeUpcoming: ack }),
                  () => {
                    close();
                    router.push("/clients");
                  },
                )
              }
            >
              <p className="text-sm">This permanently deletes this {clientWord.toLowerCase()} and all of their appointments. It cannot be undone.</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm">
                <dt>Past appointments</dt><dd className="text-right font-semibold">{summary.past}</dd>
                <dt>Upcoming appointments</dt><dd className="text-right font-semibold">{summary.upcoming}</dd>
                <dt>Cancelled appointments</dt><dd className="text-right font-semibold">{summary.cancelled}</dd>
                <dt className="font-semibold">Total removed</dt><dd className="text-right font-semibold">{summary.total}</dd>
              </dl>
              {needsAck && (
                <div className="rounded-lg border border-overdue p-3 text-sm" role="alert">
                  <p className="font-semibold text-overdue">This {clientWord.toLowerCase()} has upcoming appointments.</p>
                  <p className="mt-1">{summary.upcoming} booked {summary.upcoming === 1 ? "appointment" : "appointments"} will be removed and will no longer be on the calendar. The {clientWord.toLowerCase()} is not notified.</p>
                  <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" /> I understand these upcoming appointments will be permanently deleted.</label>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button className="btn btn-primary" disabled={pending || (needsAck && !ack)}>{pending ? "Deleting..." : `Delete ${clientWord.toLowerCase()}`}</button>
              </div>
            </form>
          </Dialog>
        </>
      )}
    </>
  );
}
