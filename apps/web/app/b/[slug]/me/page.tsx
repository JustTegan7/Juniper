import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatDay, formatTimeIn, STATUS_LABELS, utcToZoned } from "@evergreen/core";
import { auth } from "../../../../lib/auth";
import { clientAppointments, loadBusinessBySlug } from "../../../../lib/services/public";
import { AccountSignIn, ManageButton, SignOut } from "./AccountForms";

export const metadata: Metadata = { title: "Your appointments", robots: { index: false } };

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await loadBusinessBySlug(slug);
  if (!ws) notFound();
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return <AccountSignIn slug={ws.slug} businessName={ws.name} />;
  const data = await clientAppointments(ws, session);
  const tz = ws.timezone;
  const when = (iso: string) => `${formatDay(utcToZoned(new Date(iso), tz).day, { weekday: "long" })} at ${formatTimeIn(new Date(iso), tz)}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{data?.name ? `Hi, ${data.name}` : "Your appointments"}</h1>
        <SignOut slug={ws.slug} />
      </div>
      {!data || (!data.upcoming.length && !data.past.length) ? (
        <p className="card p-6 text-center text-muted">No appointments found for {session.user.email} at {ws.name}. <a className="underline" href={`/b/${ws.slug}`}>Book one</a></p>
      ) : (
        <>
          <section className="card p-4" aria-labelledby="h-up">
            <h2 id="h-up" className="font-bold">Coming up</h2>
            <ul className="mt-2 divide-y divide-line">
              {data.upcoming.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span><span className="block font-semibold">{a.serviceName} with {a.staffName}</span><span className="text-sm">{when(a.startsAt)}</span></span>
                  {a.changeable ? <ManageButton slug={ws.slug} id={a.id} /> : <span className="text-xs text-muted">Call to change</span>}
                </li>
              ))}
              {!data.upcoming.length && <li className="py-3 text-sm text-muted">Nothing booked. <a className="underline" href={`/b/${ws.slug}`}>Book now</a></li>}
            </ul>
          </section>
          {data.past.length > 0 && (
            <section className="card p-4" aria-labelledby="h-past">
              <h2 id="h-past" className="font-bold">Past</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {data.past.map((a) => <li key={a.id} className="py-2">{when(a.startsAt)} · {a.serviceName} with {a.staffName} · {STATUS_LABELS[a.status]}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
