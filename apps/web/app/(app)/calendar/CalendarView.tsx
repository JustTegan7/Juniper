"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  formatDuration,
  formatMinutes,
  formatPrice,
  formatTimeIn,
  STATUS_LABELS,
  toHm,
  utcToZoned,
  type AppointmentStatus,
  type DayWindow,
  type Interval,
} from "@evergreen/core";
import type { CalendarItem } from "../../../lib/services/appointments";
import { bookAction, rescheduleAction, saveStaffNoteAction, setStatusAction, staffSlotsAction } from "../actions";
import { ClientPicker, type PickedClient } from "../../../components/app/ClientPicker";
import { Dialog } from "../../../components/app/Dialog";
import { IconChevronLeft, IconChevronRight, IconPlus } from "../../../components/app/Icons";
import { useAct } from "../../../components/app/useAct";

type Column = { id: string; name: string; color: string; title: string | null };
type Svc = { id: string; name: string; minutes: number; staffIds: string[] };

interface Props {
  day: string;
  today: string;
  prev: string;
  next: string;
  title: string;
  tz: string;
  canEditAll: boolean;
  myMembershipId: string;
  clientLabel: string;
  staffLabel: string;
  openBook: boolean;
  columns: Column[];
  windows: Record<string, DayWindow[]>;
  businessWindows: DayWindow[];
  timeOff: Record<string, Interval[]>;
  items: CalendarItem[];
  services: Svc[];
}

const PX_PER_MIN = 1.4;
const STATUS_STYLE: Record<AppointmentStatus, string> = {
  booked: "",
  confirmed: "",
  checked_in: "ring-2 ring-today",
  completed: "opacity-60",
  cancelled: "opacity-40 line-through",
  no_show: "opacity-40",
};

export function CalendarView(p: Props) {
  const router = useRouter();
  const [booking, setBooking] = useState<{ membershipId: string; time: string } | null>(p.openBook ? { membershipId: p.canEditAll ? p.columns[0]?.id ?? "" : p.myMembershipId, time: "" } : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const open = p.items.find((i) => i.id === openId) ?? null;

  // Visible hours: from the earliest window (or 8 AM) to the latest (or 7 PM), padded by an hour.
  const { startMin, endMin } = useMemo(() => {
    const all = [...p.businessWindows, ...Object.values(p.windows).flat()];
    const itemMins = p.items.map((i) => {
      const s = utcToZoned(new Date(i.startsAt), p.tz).minutes;
      return { start: s, end: s + (new Date(i.endsAt).getTime() - new Date(i.startsAt).getTime()) / 60_000 };
    });
    const lo = Math.min(8 * 60, ...all.map((w) => w.start), ...itemMins.map((m) => m.start));
    const hi = Math.max(19 * 60, ...all.map((w) => w.end), ...itemMins.map((m) => m.end));
    return { startMin: Math.max(0, Math.floor(lo / 60) * 60 - 60), endMin: Math.min(24 * 60, Math.ceil(hi / 60) * 60 + 60) };
  }, [p.businessWindows, p.windows, p.items, p.tz]);

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const height = (endMin - startMin) * PX_PER_MIN;
  const y = (min: number) => (min - startMin) * PX_PER_MIN;

  // Live "now" line on today.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    if (p.day !== p.today) return;
    const tick = () => setNowMin(utcToZoned(new Date(), p.tz).minutes);
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [p.day, p.today, p.tz]);

  const visible = p.items.filter((i) => showCancelled || (i.status !== "cancelled" && i.status !== "no_show"));
  const hidden = p.items.length - visible.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold sm:text-3xl">{p.title}</h1>
        <div className="flex items-center gap-1">
          <Link href={`/calendar?day=${p.prev}`} className="btn btn-soft btn-sm" aria-label="Previous day"><IconChevronLeft /></Link>
          {p.day !== p.today && <Link href="/calendar" className="btn btn-soft btn-sm">Today</Link>}
          <Link href={`/calendar?day=${p.next}`} className="btn btn-soft btn-sm" aria-label="Next day"><IconChevronRight /></Link>
          <input type="date" className="input w-auto py-1 text-sm" value={p.day} aria-label="Go to date" onChange={(e) => e.target.value && router.push(`/calendar?day=${e.target.value}`)} />
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setBooking({ membershipId: p.canEditAll ? p.columns[0]?.id ?? "" : p.myMembershipId, time: "" })}>
          <IconPlus /> Book
        </button>
      </div>
      {hidden > 0 && (
        <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => setShowCancelled(!showCancelled)}>
          {showCancelled ? "Hide" : "Show"} {hidden} cancelled or no show
        </button>
      )}

      {!p.columns.length ? (
        <p className="card mt-6 p-10 text-center text-muted">Nobody takes appointments yet. Add your team and turn on &quot;Takes appointments&quot; on the Team page.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <div className="flex min-w-max">
            {/* Time gutter */}
            <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface">
              <div className="h-12 border-b border-line" />
              <div className="relative" style={{ height }}>
                {hours.map((m) => (
                  <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: y(m) }}>{m === startMin ? "" : formatMinutes(m)}</span>
                ))}
              </div>
            </div>
            {p.columns.map((col) => {
              const editable = p.canEditAll || col.id === p.myMembershipId;
              return (
                <div key={col.id} className="w-44 shrink-0 border-r border-line last:border-r-0 sm:w-52">
                  <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-line bg-surface px-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.color }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{col.name}</p>
                      {col.title && <p className="truncate text-[11px] text-muted">{col.title}</p>}
                    </div>
                  </div>
                  <div
                    className={`relative bg-surface-2/60 ${editable ? "cursor-pointer" : ""}`}
                    style={{ height }}
                    onClick={(e) => {
                      if (!editable || e.target !== e.currentTarget) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const min = Math.floor((e.clientY - rect.top) / PX_PER_MIN / 15) * 15 + startMin;
                      setBooking({ membershipId: col.id, time: toHm(min) });
                    }}
                  >
                    {/* Working hours shown light */}
                    {(p.windows[col.id] ?? []).map((w, i) => (
                      <div key={i} className="pointer-events-none absolute inset-x-0 bg-surface" style={{ top: y(w.start), height: (w.end - w.start) * PX_PER_MIN }} />
                    ))}
                    {hours.map((m) => (
                      <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: y(m) }} />
                    ))}
                    {(p.timeOff[col.id] ?? []).map((t, i) => {
                      const sDay = utcToZoned(new Date(t.start), p.tz);
                      const s = sDay.day < p.day ? startMin : Math.max(startMin, sDay.minutes);
                      const eDay = utcToZoned(new Date(t.end), p.tz);
                      const e = eDay.day > p.day ? endMin : Math.min(endMin, eDay.minutes);
                      return (
                        <div key={i} className="pointer-events-none absolute inset-x-1 flex items-start justify-center rounded-md border border-dashed border-muted/50 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--border)_6px,var(--border)_8px)] pt-1 text-[11px] font-semibold text-muted" style={{ top: y(s), height: Math.max(0, e - s) * PX_PER_MIN }}>
                          Time off
                        </div>
                      );
                    })}
                    {visible
                      .filter((i) => i.membershipId === col.id)
                      .map((i) => {
                        const s = utcToZoned(new Date(i.startsAt), p.tz).minutes;
                        const total = i.activeBefore + i.processing + i.activeAfter;
                        return (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => setOpenId(i.id)}
                            className={`absolute inset-x-1 overflow-hidden rounded-md text-left text-[11px] leading-tight text-white shadow-sm ${STATUS_STYLE[i.status]}`}
                            style={{ top: y(s), height: Math.max(18, total * PX_PER_MIN) }}
                            aria-label={`${i.clientName}, ${i.serviceName}, ${formatTimeIn(new Date(i.startsAt), p.tz)}`}
                          >
                            <span className="absolute inset-x-0 top-0" style={{ height: i.activeBefore * PX_PER_MIN, background: col.color }} />
                            {i.processing > 0 && (
                              <span
                                className="absolute inset-x-0"
                                style={{ top: i.activeBefore * PX_PER_MIN, height: i.processing * PX_PER_MIN, background: `repeating-linear-gradient(135deg, ${col.color}55, ${col.color}55 6px, ${col.color}22 6px, ${col.color}22 12px)` }}
                              />
                            )}
                            {i.activeAfter > 0 && <span className="absolute inset-x-0" style={{ top: (i.activeBefore + i.processing) * PX_PER_MIN, height: i.activeAfter * PX_PER_MIN, background: col.color }} />}
                            <span className="relative block px-1.5 py-1 drop-shadow-[0_1px_1px_rgba(0,0,0,.35)]">
                              <span className="block truncate font-bold">{i.clientName}</span>
                              <span className="block truncate">{formatTimeIn(new Date(i.startsAt), p.tz)} {i.serviceName}</span>
                              {i.source === "online" && <span className="block truncate opacity-90">Booked online</span>}
                            </span>
                          </button>
                        );
                      })}
                    {nowMin != null && nowMin >= startMin && nowMin <= endMin && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-overdue" style={{ top: y(nowMin) }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Striped time is processing: the {p.staffLabel.toLowerCase()} is free to take someone else.</p>

      <BookDialog
        key={booking ? `${booking.membershipId}-${booking.time}` : "closed"}
        open={Boolean(booking)}
        onClose={() => setBooking(null)}
        initial={booking}
        day={p.day}
        tz={p.tz}
        columns={p.canEditAll ? p.columns : p.columns.filter((c) => c.id === p.myMembershipId)}
        services={p.services}
        clientLabel={p.clientLabel}
      />
      {open && (
        <AppointmentPanel
          key={open.id + open.status + open.startsAt}
          item={open}
          onClose={() => setOpenId(null)}
          tz={p.tz}
          editable={p.canEditAll || open.membershipId === p.myMembershipId}
          columns={p.canEditAll ? p.columns : p.columns.filter((c) => c.id === p.myMembershipId)}
          staffName={p.columns.find((c) => c.id === open.membershipId)?.name ?? ""}
        />
      )}
    </div>
  );
}

function SlotChips({ serviceId, membershipId, day, tz, excludeAppointmentId, onPick, value }: { serviceId: string; membershipId: string; day: string; tz: string; excludeAppointmentId?: string; onPick: (hm: string) => void; value: string }) {
  const [slots, setSlots] = useState<number[] | null>(null);
  useEffect(() => {
    if (!serviceId || !membershipId || !day) return;
    let live = true;
    staffSlotsAction({ serviceId, membershipId, day, excludeAppointmentId }).then((s) => live && setSlots(s));
    return () => {
      live = false;
      setSlots(null);
    };
  }, [serviceId, membershipId, day, excludeAppointmentId]);
  if (!serviceId || !membershipId) return null;
  if (slots == null) return <p className="text-xs text-muted">Finding open times...</p>;
  if (!slots.length) return <p className="text-xs text-muted">No open times in their schedule that day. You can still type a time.</p>;
  return (
    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
      {slots.map((t) => {
        const hm = toHm(utcToZoned(new Date(t), tz).minutes);
        return (
          <button key={t} type="button" onClick={() => onPick(hm)} className={`pill border ${hm === value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}>
            {formatTimeIn(new Date(t), tz)}
          </button>
        );
      })}
    </div>
  );
}

function BookDialog({ open, onClose, initial, day, tz, columns, services, clientLabel }: { open: boolean; onClose: () => void; initial: { membershipId: string; time: string } | null; day: string; tz: string; columns: Column[]; services: Svc[]; clientLabel: string }) {
  const { act, pending } = useAct();
  const [client, setClient] = useState<PickedClient | null>(null);
  const [membershipId, setMembershipId] = useState(initial?.membershipId || columns[0]?.id || "");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState(initial?.time ?? "");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [force, setForce] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const forStaff = services.filter((s) => s.staffIds.includes(membershipId));

  function submit() {
    setConflict(null);
    act(
      () => bookAction({ clientId: client?.id ?? "", serviceId, membershipId, day: date, time, staffNote: note, force: force ? "on" : "", notifyClient: notify ? "on" : "" }),
      () => onClose(),
      (r) => r.conflict && setConflict(r.error),
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="New appointment">
      <div className="space-y-4">
        <div>
          <span className="label">{clientLabel}</span>
          <ClientPicker value={client} onChange={setClient} clientLabel={clientLabel} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">With</span>
            <select className="input" value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Service</span>
            <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Pick a service</option>
              {forStaff.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatDuration(s.minutes)})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Date</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Start time</span>
            <input type="time" step={300} className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <SlotChips serviceId={serviceId} membershipId={membershipId} day={date} tz={tz} onPick={setTime} value={time} />
        <label className="block">
          <span className="label">Note for the team (optional)</span>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email a confirmation to the {clientLabel.toLowerCase()}
        </label>
        {conflict && (
          <div className="rounded-lg border border-overdue/40 p-3 text-sm">
            <p className="text-overdue">{conflict}</p>
            <label className="mt-2 flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Book anyway
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || !client || !serviceId || !time} onClick={submit}>{pending ? "Booking..." : "Book"}</button>
        </div>
      </div>
    </Dialog>
  );
}

function AppointmentPanel({ item, onClose, tz, editable, columns, staffName }: { item: CalendarItem; onClose: () => void; tz: string; editable: boolean; columns: Column[]; staffName: string }) {
  const { act, pending } = useAct();
  const local = utcToZoned(new Date(item.startsAt), tz);
  const [moving, setMoving] = useState(false);
  const [membershipId, setMembershipId] = useState(item.membershipId);
  const [date, setDate] = useState(local.day);
  const [time, setTime] = useState(toHm(local.minutes));
  const [force, setForce] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [note, setNote] = useState(item.staffNote ?? "");
  const upcoming = ["booked", "confirmed", "checked_in"].includes(item.status);

  const status = (s: AppointmentStatus) => act(() => setStatusAction({ id: item.id, status: s, notifyClient: "on" }), s === "cancelled" ? onClose : undefined);

  return (
    <Dialog open onClose={onClose} title={item.clientName}>
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="font-semibold">{item.serviceName} with {staffName}</p>
          <p>{formatTimeIn(new Date(item.startsAt), tz)} to {formatTimeIn(new Date(item.endsAt), tz)} · {formatPrice(item.priceCents)}</p>
          {item.processing > 0 && <p className="text-muted">{item.activeBefore} min, then {item.processing} min processing, then {item.activeAfter} min</p>}
          <p className="mt-1"><span className="pill bg-surface">{STATUS_LABELS[item.status]}</span> {item.source === "online" && <span className="pill bg-surface">Booked online</span>}</p>
        </div>
        <p>
          <Link href={`/clients/${item.clientId}`} className="font-semibold underline">Client profile</Link>
          {item.clientPhone && <> · <a className="underline" href={`tel:${item.clientPhone}`}>{item.clientPhone}</a></>}
          {item.clientEmail && <> · <a className="underline" href={`mailto:${item.clientEmail}`}>Email</a></>}
        </p>
        {item.clientNote && <p className="rounded-lg border border-line p-3"><span className="label">Client note</span>{item.clientNote}</p>}

        {editable && (
          <>
            <div className="flex flex-wrap gap-2">
              {item.status === "booked" && <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => status("confirmed")}>Confirm</button>}
              {(item.status === "booked" || item.status === "confirmed") && <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => status("checked_in")}>Check in</button>}
              {upcoming && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => status("completed")}>Complete</button>}
              {upcoming && <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => setMoving(!moving)}>Move</button>}
              {upcoming && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => status("no_show")}>No show</button>}
              {upcoming && <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => status("cancelled")}>Cancel</button>}
              {!upcoming && <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => status("booked")}>Put back on the books</button>}
            </div>
            {moving && (
              <div className="space-y-3 rounded-lg border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className="input" value={membershipId} onChange={(e) => setMembershipId(e.target.value)} aria-label="With">
                    {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
                  <input type="time" step={300} className="input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
                </div>
                {conflict && (
                  <div className="text-sm">
                    <p className="text-overdue">{conflict}</p>
                    <label className="mt-1 flex items-center gap-2 font-semibold"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Book anyway</label>
                  </div>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={pending}
                  onClick={() => {
                    setConflict(null);
                    act(() => rescheduleAction({ id: item.id, membershipId, day: date, time, force: force ? "on" : "", notifyClient: "on" }), onClose, (r) => r.conflict && setConflict(r.error));
                  }}
                >
                  Move appointment
                </button>
              </div>
            )}
            <div>
              <label className="label" htmlFor="staff-note">Team note</label>
              <textarea id="staff-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-soft btn-sm mt-2" disabled={pending} onClick={() => act(() => saveStaffNoteAction({ id: item.id, staffNote: note }))}>Save note</button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
