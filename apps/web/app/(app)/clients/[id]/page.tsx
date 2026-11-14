import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDay, formatPrice, isManager, formatTimeIn, STATUS_LABELS, utcToZoned } from "@evergreen/core";
import { getCtx, requireModule } from "../../../../lib/services/ctx";
import { clientName, formatPhone, getClient, getClientDeleteSummary } from "../../../../lib/services/clients";
import { ClientActions } from "../ClientActions";

export const metadata: Metadata = { title: "Client" };

function nowMs() {
  return Date.now();
}

type HistoryRow = NonNullable<Awaited<ReturnType<typeof getClient>>>["history"][number];

function Item({ h, tz }: { h: HistoryRow; tz: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>
        <Link className="font-semibold underline" href={`/calendar?day=${utcToZoned(h.startsAt, tz).day}`}>{formatDay(utcToZoned(h.startsAt, tz).day, { year: true })} {formatTimeIn(h.startsAt, tz)}</Link>
        {" · "}{h.serviceName} with {h.staffName}
      </span>
      <span className="text-muted">{STATUS_LABELS[h.status]} · {formatPrice(h.priceCents)}</span>
    </li>
  );
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  requireModule(ctx, "customers");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getClient(ctx, id);
  if (!data) notFound();
  const { client: c, history } = data;
  const tz = ctx.workspace.timezone;
  const now = nowMs();
  const upcoming = history.filter((h) => h.startsAt.getTime() >= now && ["booked", "confirmed", "checked_in"].includes(h.status)).reverse();
  const past = history.filter((h) => !upcoming.includes(h));
  const spent = history.filter((h) => h.status === "completed").reduce((n, h) => n + h.priceCents, 0);
  const canDelete = isManager(ctx.role);
  const summary = canDelete ? await getClientDeleteSummary(ctx, { id: c.id }, new Date(now)) : null;
  const visits = history.filter((h) => h.status === "completed").length;


  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-sm text-muted underline">All {ctx.workspace.vocab.clientPlural.toLowerCase()}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{clientName(c)}</h1>
          <p className="mt-1 text-muted">
            {c.phone && <a className="underline" href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a>}
            {c.phone && c.email && " · "}
            {c.email && <a className="underline" href={`mailto:${c.email}`}>{c.email}</a>}
          </p>
          <p className="mt-1 text-sm text-muted">{visits} completed visit{visits === 1 ? "" : "s"} · {formatPrice(spent)} total</p>
        </div>
        <div className="flex gap-2">
          <ClientActions
            client={{ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: formatPhone(c.phone), notes: c.notes }}
            name={clientName(c)}
            clientWord={ctx.workspace.vocab.client}
            canDelete={canDelete}
            summary={summary}
          />
          <Link href="/calendar?book=1" className="btn btn-primary btn-sm">Book</Link>
        </div>
      </div>
      {c.notes && <section className="card whitespace-pre-wrap p-5 text-sm"><h2 className="label">Notes</h2>{c.notes}</section>}
      <section className="card p-5" aria-labelledby="h-up">
        <h2 id="h-up" className="font-bold">Upcoming</h2>
        <ul className="mt-2 divide-y divide-line">{upcoming.map((h) => <Item key={h.id} h={h} tz={tz} />)}{!upcoming.length && <li className="py-2 text-sm text-muted">Nothing booked.</li>}</ul>
      </section>
      <section className="card p-5" aria-labelledby="h-past">
        <h2 id="h-past" className="font-bold">History</h2>
        <ul className="mt-2 divide-y divide-line">{past.map((h) => <Item key={h.id} h={h} tz={tz} />)}{!past.length && <li className="py-2 text-sm text-muted">No past visits.</li>}</ul>
      </section>
    </div>
  );
}
