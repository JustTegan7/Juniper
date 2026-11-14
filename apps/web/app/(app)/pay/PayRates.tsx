"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePayProfileAction } from "../actions";
import { useAct } from "../../../components/app/useAct";

type Row = { membershipId: string; name: string; payType: "hourly" | "salary" | ""; rate: string };

export function PayRates({ rows }: { rows: Row[] }) {
  return (
    <ul className="card divide-y divide-line">
      {rows.map((r) => <PayRow key={r.membershipId} row={r} />)}
    </ul>
  );
}

function PayRow({ row }: { row: Row }) {
  const router = useRouter();
  const { act, pending } = useAct();
  const [type, setType] = useState<Row["payType"]>(row.payType);
  const [rate, setRate] = useState(row.rate);
  return (
    <li>
      <form
        className="flex flex-wrap items-center gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => savePayProfileAction({ membershipId: row.membershipId, payType: type, rate: type ? rate : "" }), () => router.refresh());
        }}
      >
        <span className="min-w-40 flex-1 font-semibold">{row.name}</span>
        <select className="input w-auto py-1" aria-label={`Pay type for ${row.name}`} value={type} onChange={(e) => setType(e.target.value as Row["payType"])}>
          <option value="">Not set</option>
          <option value="hourly">Hourly</option>
          <option value="salary">Salary</option>
        </select>
        {type && (
          <label className="flex items-center gap-1 text-sm">
            $
            <input className="input w-28 py-1" inputMode="decimal" aria-label={`${type === "hourly" ? "Dollars per hour" : "Dollars per year"} for ${row.name}`} value={rate} onChange={(e) => setRate(e.target.value)} placeholder={type === "hourly" ? "18.50" : "52000"} required />
            {type === "hourly" ? "per hour" : "per year"}
          </label>
        )}
        <button className="btn btn-soft btn-sm" disabled={pending}>Save</button>
      </form>
    </li>
  );
}
