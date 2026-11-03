import type { Metadata } from "next";
import { formatDay, formatTimeIn, isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { listTimeOff, type TimeOffRow } from "../../../lib/services/timeoff";
import { loadMembers } from "../../../lib/services/workspace";
import { RequestForm, ReviewButtons, CancelButton } from "./TimeOffForms";

export const metadata: Metadata = { title: "Time off" };

function span(t: TimeOffRow, tz: string) {
  if (t.allDay) return t.startDay === t.endDay ? formatDay(t.startDay, { weekday: "long" }) : `${formatDay(t.startDay)} to ${formatDay(t.endDay)}`;
  const s = `${formatDay(t.startDay)} ${formatTimeIn(t.startsAt, tz)}`;
  return t.startDay === t.endDay ? `${s} to ${formatTimeIn(t.endsAt, tz)}` : `${s} to ${formatDay(t.endDay)} ${formatTimeIn(t.endsAt, tz)}`;
}

const STATUS: Record<string, string> = { pending: "Waiting for review", approved: "Approved", denied: "Denied", cancelled: "Cancelled" };

function Row({ t, tz, manager, actions }: { t: TimeOffRow; tz: string; manager: boolean; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{manager ? `${t.name} · ` : ""}{span(t, tz)}</p>
        <p className="text-sm text-muted">{STATUS[t.status]}{t.reason ? ` · ${t.reason}` : ""}{t.reviewNote ? ` · Note: ${t.reviewNote}` : ""}</p>
      </div>
      {actions}
    </li>
  );
}

export default async function TimeOffPage() {
  const ctx = await getCtx();
  const tz = ctx.workspace.timezone;
  const manager = isManager(ctx.role);
  const [open, past, members] = await Promise.all([listTimeOff(ctx, { scope: "open" }), listTimeOff(ctx, { scope: "past" }), manager ? loadMembers(ctx.workspace.id) : Promise.resolve([])]);
  const pending = open.filter((t) => t.status === "pending");
  const approved = open.filter((t) => t.status === "approved");


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">Time off</h1>
        <RequestForm today={ctx.today} members={manager ? members.map((m) => ({ id: m.membershipId, name: m.name })) : []} myId={ctx.membershipId} />
      </div>

      {manager && (
        <section className="card p-5" aria-labelledby="h-review">
          <h2 id="h-review" className="font-bold">Waiting for review</h2>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((t) => (
              <Row key={t.id} tz={tz} manager={manager} t={t} actions={t.membershipId === ctx.membershipId && ctx.role !== "owner" ? <CancelButton id={t.id} /> : <ReviewButtons id={t.id} />} />
            ))}
            {!pending.length && <li className="py-3 text-sm text-muted">Nothing to review.</li>}
          </ul>
        </section>
      )}

      <section className="card p-5" aria-labelledby="h-upcoming">
        <h2 id="h-upcoming" className="font-bold">{manager ? "Upcoming time off" : "Your requests"}</h2>
        <ul className="mt-2 divide-y divide-line">
          {(manager ? approved : open).map((t) => (
            <Row key={t.id} tz={tz} manager={manager} t={t} actions={manager || t.status === "pending" || t.startsAt > new Date() ? <CancelButton id={t.id} /> : undefined} />
          ))}
          {!(manager ? approved : open).length && <li className="py-3 text-sm text-muted">Nothing coming up.</li>}
        </ul>
      </section>

      {past.length > 0 && (
        <section className="card p-5" aria-labelledby="h-past">
          <h2 id="h-past" className="font-bold">Past and closed</h2>
          <ul className="mt-2 divide-y divide-line">{past.map((t) => <Row key={t.id} tz={tz} manager={manager} t={t} />)}</ul>
        </section>
      )}
    </div>
  );
}
