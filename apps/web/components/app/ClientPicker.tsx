"use client";

import { useEffect, useId, useState } from "react";
import { saveClientAction, searchClientsAction } from "../../app/(app)/actions";
import { useAct } from "./useAct";

export type PickedClient = { id: string; name: string; email: string | null; phone: string };

/** Search existing clients, or add a new one without leaving the booking form. */
export function ClientPicker({ value, onChange, clientLabel }: { value: PickedClient | null; onChange: (c: PickedClient | null) => void; clientLabel: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedClient[]>([]);
  const [adding, setAdding] = useState(false);
  const { act, pending } = useAct();

  useEffect(() => {
    if (value || adding) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchClientsAction(q);
      if (live) setResults(r);
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, value, adding]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{value.name}</p>
          <p className="truncate text-xs text-muted">{[value.phone, value.email].filter(Boolean).join(" · ") || "No contact info"}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="space-y-2 rounded-lg border border-line p-3">
        <p className="text-sm font-semibold">New {clientLabel.toLowerCase()}</p>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="First name" id={`${id}-fn`} aria-label="First name" />
          <input className="input" placeholder="Last name" id={`${id}-ln`} aria-label="Last name" />
          <input className="input" placeholder="Phone" id={`${id}-ph`} aria-label="Phone" type="tel" />
          <input className="input" placeholder="Email" id={`${id}-em`} aria-label="Email" type="email" />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              const get = (s: string) => (document.getElementById(`${id}-${s}`) as HTMLInputElement).value;
              const input = { firstName: get("fn"), lastName: get("ln"), phone: get("ph"), email: get("em") };
              act(
                () => saveClientAction(input),
                (r) => {
                  onChange({ id: r.id!, name: `${input.firstName} ${input.lastName}`.trim(), email: input.email || null, phone: input.phone });
                  setAdding(false);
                },
              );
            }}
          >
            Add
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input className="input" id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" aria-label={`Find a ${clientLabel.toLowerCase()}`} autoComplete="off" />
      <ul className="mt-2 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {results.map((r) => (
          <li key={r.id}>
            <button type="button" className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => onChange(r)}>
              <span className="block font-semibold">{r.name}</span>
              <span className="block text-xs text-muted">{[r.phone, r.email].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
        {!results.length && <li className="px-3 py-2 text-sm text-muted">No matches.</li>}
      </ul>
      <button type="button" className="btn btn-soft btn-sm mt-2" onClick={() => setAdding(true)}>+ New {clientLabel.toLowerCase()}</button>
    </div>
  );
}
