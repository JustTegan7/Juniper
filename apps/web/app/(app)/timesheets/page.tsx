import type { Metadata } from "next";
import Link from "next/link";
import { FLAG_LABELS, formatDay, formatHours, formatTimeIn, isManager, isYmd, nextPayPeriod, payPeriodFor, previousPayPeriod, toHm, utcToZoned } from "@evergreen/core";
import { getCtx, requireModule } from "../../../lib/services/ctx";
import { loadTimesheets } from "../../../lib/services/timeclock";
import { loadMembers } from "../../../lib/services/workspace";
import { EntryEditor } from "./EntryEditor";

export const metadata: Metadata = { title: "Timesheets" };

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ start?: string; person?: string }> }) {
  const ctx = await getCtx();
  requireModule(ctx, "timeclock");
  const sp = await searchParams;
  const tz = ctx.workspace.timezone;
  const t = ctx.workspace.settings.time;
  const period = payPeriodFor(sp.start && isYmd(sp.start) ? sp.start : ctx.today, t.payPeriod, t.payPeriodAnchor);
  const prev = previousPayPeriod(period, t.payPeriod, t.payPeriodAnchor);
  const next = nextPayPeriod(period, t.payPeriod, t.payPeriodAnchor);
  const manager = isManager(ctx.role);
  const person = manager ? sp.person : ctx.membershipId;
  const [sheets, members] = await Promise.all([loadTimesheets(ctx, period.start, period.end), manager ? loadMembers(ctx.workspace.id) : Promise.resolve([])]);
  const detail = sheets.find((s) => s.member.membershipId === person) ?? (sheets.length === 1 ? sheets[0] : undefined);
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => Boolean(e[1]))).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl font-bold">Timesheets</h1>
        <Link href={`/timesheets${qs({ start: prev.start, person: sp.person })}`} className="btn btn-soft btn-sm">Previous</Link>
        <span className="text-sm font-semibold">{formatDay(period.start)} to {formatDay(period.end, { year: true })}</span>
        <Link href={`/timesheets${qs({ start: next.start, person: sp.person })}`} className="btn btn-soft btn-sm">Next</Link>
      </div>

      {manager && (
        <section className="card overflow-x-auto" aria-labelledby="h-team">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <h2 id="h-team" className="font-bold">Team totals</h2>
            <div className="flex gap-2">
              <a className="btn btn-soft btn-sm" href={`/api/timesheets?start=${period.start}&end=${period.end}&mode=summary`}>Export summary CSV</a>
              <a className="btn btn-soft btn-sm" href={`/api/timesheets?start=${period.start}&end=${period.end}&mode=detail`}>Export shifts CSV</a>
            </div>
          </div>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-y border-line text-left text-xs text-muted">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Worked</th><th className="px-4 py-2">Regular</th><th className="px-4 py-2">Overtime</th><th className="px-4 py-2">To review</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sheets.map((s) => (
                <tr key={s.member.membershipId} className={s.member.membershipId === detail?.member.membershipId ? "bg-surface-2" : ""}>
                  <td className="px-4 py-2"><Link className="font-semibold underline" href={`/timesheets${qs({ start: period.start, person: s.member.membershipId })}`}>{s.member.name}</Link></td>
                  <td className="px-4 py-2">{formatHours(s.sheet.workedMinutes)}</td>
                  <td className="px-4 py-2">{formatHours(s.sheet.regularMinutes)}</td>
                  <td className="px-4 py-2">{s.sheet.overtimeMinutes ? <span className="font-semibold text-today">{formatHours(s.sheet.overtimeMinutes)}</span> : "0:00"}</td>
                  <td className="px-4 py-2">{s.sheet.flagCount ? <span className="font-semibold text-overdue">{s.sheet.flagCount}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-4 text-xs text-muted">Overtime and break flags follow the rules on the Settings page (Washington defaults). They help you review; they are not legal advice.</p>
        </section>
      )}

      {detail && (
        <section className="card p-5" aria-labelledby="h-detail">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-detail" className="font-bold">{detail.member.name}</h2>
            {manager && <EntryEditor membershipId={detail.member.membershipId} members={members.map((m) => ({ id: m.membershipId, name: m.name }))} defaultDay={ctx.today} label="Add a shift" />}
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {detail.sheet.days.filter((d) => d.punches.length).map((d) => (
              <li key={d.day} className="py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{formatDay(d.day, { weekday: "long" })}</span>
                  <span>{formatHours(d.workedMinutes)}{d.overtimeMinutes > 0 && <span className="text-today"> ({formatHours(d.overtimeMinutes)} overtime)</span>}</span>
                </div>
                {d.punches.map((p) => {
                  const meta = detail.entries[p.id];
                  return (
                    <div key={p.id} className="mt-1 flex flex-wrap items-center justify-between gap-2 text-muted">
                      <span>
                        {formatTimeIn(new Date(p.clockIn), tz)} to {p.clockOut ? formatTimeIn(new Date(p.clockOut), tz) : "still in"}
                        {p.mealMinutes > 0 && ` · ${p.mealMinutes} min meal`}
                        {p.restMinutes > 0 && ` · ${p.restMinutes} min rest`}
                        {meta?.edited && " · edited"}
                        {meta?.note && ` · ${meta.note}`}
                      </span>
                      {manager && (
                        <EntryEditor
                          membershipId={detail.member.membershipId}
                          members={members.map((m) => ({ id: m.membershipId, name: m.name }))}
                          defaultDay={d.day}
                          label="Edit"
                          entry={{
                            id: p.id,
                            day: d.day,
                            clockIn: toHm(utcToZoned(new Date(p.clockIn), tz).minutes),
                            clockOut: p.clockOut ? toHm(utcToZoned(new Date(p.clockOut), tz).minutes) : "",
                            note: meta?.note ?? "",
                            mealStart: meta?.meal ? toHm(utcToZoned(new Date(meta.meal.start), tz).minutes) : "",
                            mealEnd: meta?.meal?.end ? toHm(utcToZoned(new Date(meta.meal.end), tz).minutes) : "",
                          }}
                        />
                      )}
                      {p.flags.filter((f) => f !== "open").map((f) => <p key={f} className="w-full text-xs text-overdue">{FLAG_LABELS[f]}</p>)}
                    </div>
                  );
                })}
              </li>
            ))}
            {!detail.sheet.days.some((d) => d.punches.length) && <li className="py-2 text-muted">No shifts this period.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
