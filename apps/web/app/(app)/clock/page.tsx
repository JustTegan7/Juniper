import type { Metadata } from "next";
import Link from "next/link";
import { FLAG_LABELS, formatDay, formatHours, formatTimeIn, payPeriodFor } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { clockStatus, loadTimesheets } from "../../../lib/services/timeclock";
import { ClockWidget } from "./ClockWidget";

export const metadata: Metadata = { title: "Time clock" };

export default async function ClockPage() {
  const ctx = await getCtx();
  const tz = ctx.workspace.timezone;
  const t = ctx.workspace.settings.time;
  const period = payPeriodFor(ctx.today, t.payPeriod, t.payPeriodAnchor);
  const [status, [mine]] = await Promise.all([clockStatus(ctx), loadTimesheets(ctx, period.start, period.end, ctx.membershipId)]);
  const days = mine?.sheet.days.filter((d) => d.punches.length).reverse() ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Time clock</h1>
      <ClockWidget
        tz={tz}
        state={{
          clockIn: status.entry?.clockIn.toISOString() ?? null,
          openBreak: status.openBreak ? { kind: status.openBreak.kind, startsAt: status.openBreak.startsAt.toISOString() } : null,
          breakMinutes: 0,
        }}
      />
      <section className="card p-5" aria-labelledby="h-period">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-period" className="font-bold">This pay period</h2>
          <p className="text-sm text-muted">{formatDay(period.start)} to {formatDay(period.end)}</p>
        </div>
        {mine && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">{formatHours(mine.sheet.workedMinutes)}</span> worked
            {mine.sheet.overtimeMinutes > 0 && <> · <span className="font-semibold">{formatHours(mine.sheet.overtimeMinutes)}</span> overtime</>}
          </p>
        )}
        <ul className="mt-3 divide-y divide-line text-sm">
          {days.map((d) =>
            d.punches.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{formatDay(d.day)}</span>
                  <span>
                    {formatTimeIn(new Date(p.clockIn), tz)} to {p.clockOut ? formatTimeIn(new Date(p.clockOut), tz) : "now"} · {formatHours(p.workedMinutes)}
                  </span>
                </div>
                {p.flags.filter((f) => f !== "open").map((f) => <p key={f} className="text-xs text-overdue">{FLAG_LABELS[f]}</p>)}
              </li>
            )),
          )}
          {!days.length && <li className="py-2 text-muted">No shifts yet this period.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted">Something wrong? Ask a manager to fix the shift. Every change is recorded. <Link href="/timesheets" className="underline">Full timesheet</Link></p>
      </section>
    </div>
  );
}
