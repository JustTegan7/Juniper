"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDay, formatDuration, formatPrice, formatTimeIn, utcToZoned } from "@evergreen/core";
import type { PublicMenu } from "../../lib/services/public";
import { publicBookAction, publicSlotsAction } from "../../app/b/[slug]/actions";

type Service = PublicMenu["categories"][number]["services"][number];
type Slot = { start: string; label: string };
type Done = { token: string; summary: { serviceName: string; staffName: string; when: string; priceCents: number; priceFrom: boolean } };

/** Tells a parent page (the embed script) how tall the booking form is. */
export function useEmbedHeight(on: boolean) {
  useEffect(() => {
    if (!on || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "juniper:height", height: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, [on]);
}

export function TimePicker({ slug, days, tz, query, value, onPick, token }: { slug: string; days: string[]; tz: string; query: { serviceId: string; staffId: string | null }; value: string | null; onPick: (s: Slot) => void; token?: string }) {
  const [day, setDay] = useState(days[0]);
  const key = `${query.serviceId}|${query.staffId}|${day}`;
  const [loaded, setLoaded] = useState<{ key: string; slots: Slot[] | null; error: boolean }>({ key: "", slots: null, error: false });
  const slots = loaded.key === key ? loaded.slots : null;
  const error = loaded.key === key && loaded.error;

  useEffect(() => {
    let live = true;
    publicSlotsAction(slug, { ...query, day }, token)
      .then((s) => live && setLoaded({ key, slots: s, error: false }))
      .catch(() => live && setLoaded({ key, slots: null, error: true }));
    return () => {
      live = false;
    };
  }, [slug, day, query, token, key]);

  const groups = useMemo(() => {
    const g: Record<string, Slot[]> = { Morning: [], Afternoon: [], Evening: [] };
    for (const s of slots ?? []) {
      const m = utcToZoned(new Date(s.start), tz).minutes;
      g[m < 720 ? "Morning" : m < 1020 ? "Afternoon" : "Evening"].push(s);
    }
    return Object.entries(g).filter(([, v]) => v.length);
  }, [slots, tz]);

  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Day">
        {days.map((d) => {
          const [wk, ...rest] = formatDay(d).split(", ");
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={d === day}
              onClick={() => setDay(d)}
              className={`flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-xs ${d === day ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface"}`}
            >
              <span className="font-semibold">{wk}</span>
              <span>{rest.join(", ")}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-24">
        {error && <p className="text-sm text-overdue">Could not load times. Check your connection and try again.</p>}
        {!error && slots == null && <p className="text-sm text-muted">Finding open times...</p>}
        {slots && !slots.length && <p className="text-sm text-muted">No open times on {formatDay(day, { weekday: "long" })}. Try another day.</p>}
        {groups.map(([name, list]) => (
          <div key={name} className="mb-3">
            <p className="label">{name}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {list.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => onPick(s)}
                  className={`rounded-lg border px-2 py-2 text-sm font-semibold ${value === s.start ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface hover:border-[var(--brand)]"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function icsFor(d: Done, business: PublicMenu["business"], minutes: number) {
  const start = new Date(d.summary.when);
  const end = new Date(start.getTime() + minutes * 60_000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Juniper One//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${d.token.slice(0, 16)}@juniperbooking.com`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`,
    `DTEND:${f(end)}`,
    `SUMMARY:${d.summary.serviceName} at ${business.name}`.replace(/[,;]/g, " "),
    business.address ? `LOCATION:${business.address.replace(/[,;]/g, " ")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body.join("\r\n"))}`;
}

function Crumb({ label, value, onEdit, done }: { label: string; value: string; onEdit: () => void; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
      <span><span className="text-muted">{label}:</span> <span className="font-semibold">{value}</span></span>
      {!done && <button type="button" className="text-sm underline" onClick={onEdit}>Change</button>}
    </div>
  );
}

export function BookingFlow({ menu, embedded = false, accountHref }: { menu: PublicMenu; embedded?: boolean; accountHref: string }) {
  useEmbedHeight(embedded);
  const b = menu.business;
  const v = b.vocab;
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null | undefined>(undefined);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const staffForService = service ? menu.staff.filter((s) => service.staffIds.includes(s.id)) : [];
  function pickService(s: Service) {
    setService(s);
    // Skip the person step when only one person does the service.
    const only = menu.staff.filter((x) => s.staffIds.includes(x.id));
    setStaffId(only.length === 1 ? only[0].id : undefined);
  }

  const query = useMemo(() => (service && staffId !== undefined ? { serviceId: service.id, staffId } : null), [service, staffId]);
  const step = done ? 5 : !service ? 1 : staffId === undefined ? 2 : !slot ? 3 : 4;
  useEffect(() => {
    if (step > 1) topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step]);

  if (!b.enabled) {
    return <p className="card p-6 text-center">Online booking is paused right now.{b.phone ? ` Please call ${b.phone} to book.` : ""}</p>;
  }
  if (!menu.categories.length) {
    return <p className="card p-6 text-center">Nothing is bookable online yet.{b.phone ? ` Please call ${b.phone}.` : ""}</p>;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !slot) return;
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const r = await publicBookAction(b.slug, {
      serviceId: service.id,
      staffId: staffId ?? null,
      start: slot.start,
      firstName: f.get("firstName"),
      lastName: f.get("lastName"),
      email: f.get("email"),
      phone: f.get("phone"),
      note: f.get("note") || undefined,
      website: f.get("website") || undefined,
      agree: b.policy ? f.get("agree") === "on" || undefined : undefined,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      if (r.error.includes("just taken")) setSlot(null);
      return;
    }
    setDone((r as unknown as { booking: Done }).booking);
  }

  const staffName = staffId ? menu.staff.find((s) => s.id === staffId)?.name : null;

  return (
    <div ref={topRef} className="space-y-4" style={{ ["--brand" as string]: b.brandColor }}>
      {service && (
        <div className="card px-4 py-1">
          <Crumb done={Boolean(done)} label={v.service} value={service.name} onEdit={() => { setService(null); setStaffId(undefined); setSlot(null); }} />
          {staffId !== undefined && <Crumb done={Boolean(done)} label="With" value={staffName ?? "Any available"} onEdit={() => { setStaffId(undefined); setSlot(null); }} />}
          {slot && <Crumb done={Boolean(done)} label="When" value={`${formatDay(utcToZoned(new Date(slot.start), b.timezone).day, { weekday: "long" })} at ${slot.label}`} onEdit={() => setSlot(null)} />}
        </div>
      )}

      {error && !done && (
        <p className="rounded-lg border border-overdue/40 bg-surface p-3 text-sm font-semibold text-overdue" role="alert">{error}</p>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Choose a {v.service.toLowerCase()}</h2>
          {menu.categories.map((c) => (
            <section key={c.id ?? "more"} className="card overflow-hidden" aria-label={c.name}>
              <h3 className="border-b border-line bg-surface-2 px-4 py-2 text-sm font-bold">{c.name}</h3>
              <ul className="divide-y divide-line">
                {c.services.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => pickService(s)}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{s.name}</span>
                        <span className="block text-sm text-muted">{formatDuration(s.minutes)}{s.description ? ` · ${s.description}` : ""}</span>
                      </span>
                      {s.priceCents > 0 && <span className="shrink-0 font-semibold">{formatPrice(s.priceCents, s.priceFrom)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Who would you like to see?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {b.allowAnyStaff && staffForService.length > 1 && (
              <button type="button" className="card flex items-center gap-3 p-4 text-left hover:border-[var(--brand)]" onClick={() => setStaffId(null)}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 font-bold">*</span>
                <span><span className="block font-semibold">Any available</span><span className="block text-sm text-muted">The most open times</span></span>
              </button>
            )}
            {staffForService.map((s) => (
              <button key={s.id} type="button" className="card flex items-center gap-3 p-4 text-left hover:border-[var(--brand)]" onClick={() => setStaffId(s.id)}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: s.color }}>{s.name.slice(0, 1)}</span>
                <span className="min-w-0"><span className="block font-semibold">{s.name}</span><span className="block truncate text-sm text-muted">{s.title ?? v.staff}{s.bio ? ` · ${s.bio}` : ""}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && query && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Pick a time</h2>
          <TimePicker slug={b.slug} days={menu.days} tz={b.timezone} query={query} value={null} onPick={(x) => { setError(null); setSlot(x); }} />
        </div>
      )}

      {step === 4 && (
        <form onSubmit={submit} className="card space-y-3 p-4">
          <h2 className="text-xl font-bold">Your details</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">First name</span><input name="firstName" className="input" required autoComplete="given-name" /></label>
            <label className="block"><span className="label">Last name</span><input name="lastName" className="input" required autoComplete="family-name" /></label>
            <label className="block"><span className="label">Phone</span><input name="phone" type="tel" className="input" required autoComplete="tel" /></label>
            <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" required autoComplete="email" /></label>
          </div>
          <label className="block"><span className="label">Anything we should know? (optional)</span><textarea name="note" rows={2} className="input" maxLength={1000} /></label>
          {/* Hidden from people. Bots fill it in and get turned away. */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {b.policy && (
            <label className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <input type="checkbox" name="agree" required className="mt-1" />
              <span><span className="font-semibold">Booking policy.</span> {b.policy}</span>
            </label>
          )}
          <button className="w-full rounded-lg bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={pending}>{pending ? "Booking..." : "Book it"}</button>
          <p className="text-xs text-muted">We will email your confirmation with a link to change or cancel.</p>
        </form>
      )}

      {step === 5 && done && (
        <div className="card space-y-3 p-6 text-center">
          <h2 className="text-2xl font-bold">You&apos;re booked</h2>
          <p>
            {done.summary.serviceName} with {done.summary.staffName}
            <br />
            <span className="font-semibold">{formatDay(utcToZoned(new Date(done.summary.when), b.timezone).day, { weekday: "long" })} at {formatTimeIn(new Date(done.summary.when), b.timezone)}</span>
          </p>
          <p className="text-sm text-muted">A confirmation is on its way to your email.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <a className="btn btn-soft" href={icsFor(done, b, service?.minutes ?? 60)} download="appointment.ics">Add to calendar</a>
            <a className="btn btn-soft" href={`/b/${b.slug}/manage/${done.token}`} target={embedded ? "_blank" : undefined} rel="noreferrer">Change or cancel</a>
          </div>
          <button type="button" className="text-sm underline" onClick={() => { setDone(null); setService(null); setStaffId(undefined); setSlot(null); }}>Book something else</button>
        </div>
      )}

      {step === 1 && (
        <p className="text-center text-sm text-muted">
          Booked before? <a className="underline" href={accountHref} target={embedded ? "_blank" : undefined} rel="noreferrer">See your appointments</a>
        </p>
      )}
    </div>
  );
}
