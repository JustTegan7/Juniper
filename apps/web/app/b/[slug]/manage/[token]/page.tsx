import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDay, formatPrice, formatTimeIn, STATUS_LABELS, utcToZoned } from "@evergreen/core";
import { loadBusinessBySlug, loadByToken } from "../../../../../lib/services/public";
import { bookableDays, todayIn } from "@evergreen/core";
import { ManageView } from "./ManageView";

export const metadata: Metadata = { title: "Your appointment", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const ws = await loadBusinessBySlug(slug);
  if (!ws) notFound();
  const found = await loadByToken(ws, token);
  if (!found) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-2xl font-bold">This link has expired</h1>
        <p className="mt-2 text-muted">Links stop working after an appointment is changed. Check your newest email from {ws.name}, or <a className="underline" href={`/b/${ws.slug}/me`}>sign in to see your appointments</a>.</p>
      </div>
    );
  }
  const { a, staffName, changeable } = found;
  const day = utcToZoned(a.startsAt, ws.timezone).day;
  return (
    <div className="space-y-4">
      <div className="card p-6">
        <p className="label">{STATUS_LABELS[a.status]}</p>
        <h1 className="text-2xl font-bold">{a.serviceName}</h1>
        <p className="mt-1">with {staffName}</p>
        <p className="mt-2 text-lg font-semibold">{formatDay(day, { weekday: "long", year: true })} at {formatTimeIn(a.startsAt, ws.timezone)}</p>
        {a.priceCents > 0 && <p className="text-sm text-muted">{formatPrice(a.priceCents)}</p>}
      </div>
      {changeable ? (
        <ManageView slug={ws.slug} token={token} tz={ws.timezone} days={bookableDays(todayIn(ws.timezone, new Date()), ws.settings.booking.maxAdvanceDays)} serviceId={a.serviceId ?? ""} staffId={a.membershipId} />
      ) : (
        ["booked", "confirmed"].includes(a.status) && (
          <p className="card p-4 text-sm">It is too close to your appointment to change it online. Please call {ws.name}{ws.settings.contact.phone ? ` at ${ws.settings.contact.phone}` : ""}.</p>
        )
      )}
      <p className="text-center text-sm"><a className="underline" href={`/b/${ws.slug}`}>Book another appointment</a></p>
    </div>
  );
}
