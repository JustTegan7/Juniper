"use client";

import { useState } from "react";
import { setTemporaryPasswordAction } from "../../app/(app)/actions";
import { useAct } from "./useAct";

export function TempPassword({ userId, name }: { userId: string; name: string }) {
  const { act, pending } = useAct();
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Set temporary password</button>;
  }
  return (
    <form className="flex w-full flex-wrap items-end gap-2 sm:w-auto" action={(f) => act(() => setTemporaryPasswordAction(f), () => setOpen(false))}>
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="label" htmlFor={`tp-${userId}`}>New password for {name}</label>
        <input id={`tp-${userId}`} name="password" type="text" minLength={10} required autoComplete="off" className="input" />
      </div>
      <button className="btn btn-primary btn-sm" disabled={pending}>Save</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
