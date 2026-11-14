import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDay, formatTimeIn, isManager, isRetail, utcToZoned } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { upcomingFor } from "../../../lib/services/appointments";
import { clockStatus } from "../../../lib/services/timeclock";
import { listTimeOff } from "../../../lib/services/timeoff";
import { ClockWidget } from "../clock/ClockWidget";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const ctx = await getCtx();
  if (isRetail(ctx.workspace.template) && ctx.workspace.settings.shop.enabled) redirect("/register");
  const tz = ctx.workspace.timezone;
  const [mine, clock, off] = await Promise.all([upcomingFor(ctx, ctx.membershipId, 7), clockStatus(ctx), isManager(ctx.role) ? listTimeOff(ctx, { scope: "open" }) : Promise.resolve([])]);
  const pending = off.filter((t) => t.status === "pending");
  const todays = mine.filter((a) => utcToZoned(a.startsAt, tz).day === ctx.today);
  const later = mine.filter((a) => utcToZoned(a.startsAt, tz).day !== ctx.today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hi, {ctx.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">{formatDay(ctx.today, { weekday: "long" })} at {ctx.workspace.name}</p>
      </div>

      <section aria-labelledby="h-clock">
        <h2 id="h-clock" className="sr-only">Time clock</h2>
        <ClockWidget
          tz={tz}
          state={{
            clockIn: clock.entry?.clockIn.toISOString() ?? null,
            openBreak: clock.openBreak ? { kind: clock.openBreak.kind, startsAt: clock.openBreak.startsAt.toISOString() } : null,
            breakMinutes: 0,
          }}
        />
      </section>

      {pending.length > 0 && (
        <Link href="/time-off" className="card block border-today p-4 font-semibold">
          {pending.length} time off request{pending.length === 1 ? "" : "s"} waiting for review
        </Link>
      )}

      <section className="card p-5" aria-labelledby="h-today">
        <div className="flex items-center justify-between">
          <h2 id="h-today" className="font-bold">Your {ctx.workspace.vocab.appointmentPlural.toLowerCase()} today</h2>
          <Link href="/calendar" className="text-sm font-semibold underline">Calendar</Link>
        </div>
        {todays.length ? (
          <ul className="mt-3 divide-y divide-line">
            {todays.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 font-semibold">{formatTimeIn(a.startsAt, tz)}</span>
                <span className="min-w-0 flex-1 truncate">{a.clientName} · {a.serviceName}</span>
                {a.status === "checked_in" && <span className="pill bg-surface-2">Here</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing booked with you today.</p>
        )}
      </section>

      {later.length > 0 && (
        <section className="card p-5" aria-labelledby="h-week">
          <h2 id="h-week" className="font-bold">Coming up this week</h2>
          <ul className="mt-3 divide-y divide-line">
            {later.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-32 shrink-0 font-semibold">{formatDay(utcToZoned(a.startsAt, tz).day)} {formatTimeIn(a.startsAt, tz)}</span>
                <span className="min-w-0 flex-1 truncate">{a.clientName} · {a.serviceName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
