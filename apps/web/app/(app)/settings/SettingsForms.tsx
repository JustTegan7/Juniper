"use client";

import { useState } from "react";
import type { Vocabulary, WeeklyHours, WorkspaceSettings } from "@evergreen/core";
import { normalizeOrigin } from "@evergreen/core";
import type { HelcimSettings } from "../../../lib/services/helcim-connection";
import { saveBusinessHoursAction, saveHelcimConnectionAction, saveHelcimDeviceAction, updateBusinessAction, updateSettingsAction } from "../actions";
import { useAct } from "../../../components/app/useAct";
import { WeekHoursEditor } from "../../../components/app/WeekHoursEditor";
import { formObject } from "../../../lib/form";

const TIMEZONES = ["America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu"];

export function BusinessDetails({ initial }: { initial: { name: string; timezone: string; brandColor: string } }) {
  const { act, pending } = useAct();
  return (
    <form className="grid gap-3 sm:grid-cols-3" action={(f) => act(() => updateBusinessAction(formObject(f)))}>
      <label className="block"><span className="label">Name</span><input name="name" className="input" defaultValue={initial.name} required /></label>
      <label className="block">
        <span className="label">Time zone</span>
        <select name="timezone" className="input" defaultValue={initial.timezone}>
          {[...new Set([initial.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Booking page color</span><input name="brandColor" type="color" className="input h-10 p-1" defaultValue={initial.brandColor} /></label>
      <div className="sm:col-span-3"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button></div>
    </form>
  );
}

export function BusinessHoursForm({ initial }: { initial: WeeklyHours[] }) {
  return <WeekHoursEditor initial={initial} onSave={(windows) => saveBusinessHoursAction(windows)} />;
}

const Num = ({ name, label, value, min, max, hint }: { name: string; label: string; value: number; min: number; max: number; hint?: string }) => (
  <label className="block">
    <span className="label">{label}</span>
    <input name={name} type="number" min={min} max={max} className="input" defaultValue={value} />
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

export function BookingRules({ initial }: { initial: WorkspaceSettings["booking"] }) {
  const { act, pending } = useAct();
  return (
    <form
      className="space-y-3"
      action={(f) => {
        const o = formObject(f);
        act(() =>
          updateSettingsAction({
            section: "booking",
            values: {
              enabled: o.enabled === "on",
              allowAnyStaff: o.allowAnyStaff === "on",
              notifyStaff: o.notifyStaff === "on",
              sendReminders: o.sendReminders === "on",
              slotStep: Number(o.slotStep),
              minLeadMinutes: Math.round(Number(o.minLeadHours) * 60),
              maxAdvanceDays: Number(o.maxAdvanceDays),
              cancelWindowHours: Number(o.cancelWindowHours),
              policy: String(o.policy ?? ""),
            },
          }),
        );
      }}
    >
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={initial.enabled} /> Online booking is on</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="allowAnyStaff" defaultChecked={initial.allowAnyStaff} /> Offer &quot;Any available&quot;</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="notifyStaff" defaultChecked={initial.notifyStaff} /> Email staff about online bookings and cancellations</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="sendReminders" defaultChecked={initial.sendReminders} /> Email clients a reminder the day before</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="label">Start times every</span>
          <select name="slotStep" className="input" defaultValue={initial.slotStep}>
            {[10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} minutes</option>)}
          </select>
        </label>
        <Num name="minLeadHours" label="Book at least (hours ahead)" value={initial.minLeadMinutes / 60} min={0} max={336} />
        <Num name="maxAdvanceDays" label="Book up to (days ahead)" value={initial.maxAdvanceDays} min={1} max={365} />
        <Num name="cancelWindowHours" label="Clients can cancel up to (hours before)" value={initial.cancelWindowHours} min={0} max={336} />
      </div>
      <label className="block">
        <span className="label">Booking policy (clients must accept it)</span>
        <textarea name="policy" rows={3} className="input" defaultValue={initial.policy} placeholder="Please give 24 hours notice to cancel or reschedule." maxLength={2000} />
      </label>
      <button className="btn btn-primary btn-sm" disabled={pending}>Save</button>
    </form>
  );
}

export function ContactForm({ initial }: { initial: WorkspaceSettings["contact"] }) {
  const { act, pending } = useAct();
  return (
    <form className="grid gap-3 sm:grid-cols-2" action={(f) => act(() => updateSettingsAction({ section: "contact", values: formObject(f) }))}>
      <label className="block"><span className="label">Phone</span><input name="phone" className="input" defaultValue={initial.phone} /></label>
      <label className="block"><span className="label">Email</span><input name="email" type="email" className="input" defaultValue={initial.email} /></label>
      <label className="block"><span className="label">Address</span><input name="address" className="input" defaultValue={initial.address} /></label>
      <label className="block"><span className="label">Website</span><input name="website" className="input" defaultValue={initial.website} /></label>
      <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button></div>
    </form>
  );
}

export function TimeRulesForm({ initial, disabled }: { initial: WorkspaceSettings["time"]; disabled: boolean }) {
  const { act, pending } = useAct();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <form
      className="space-y-3"
      action={(f) => {
        const o = formObject(f);
        act(() =>
          updateSettingsAction({
            section: "time",
            values: {
              payPeriod: o.payPeriod,
              payPeriodAnchor: o.payPeriodAnchor,
              weekStartsOn: Number(o.weekStartsOn),
              weeklyOvertimeAfter: Math.round(Number(o.overtimeHours) * 60),
              mealRequiredAfter: Math.round(Number(o.mealAfterHours) * 60),
              mealMinMinutes: Number(o.mealMinMinutes),
              mealStartBy: Math.round(Number(o.mealStartByHours) * 60),
              mealUnpaid: o.mealUnpaid === "on",
              trackRestBreaks: o.trackRestBreaks === "on",
              showPayEstimates: o.showPayEstimates === "on",
              employeesSeeOwnPay: o.employeesSeeOwnPay === "on",
              payrollName: o.payrollName ?? "",
              payrollUrl: o.payrollUrl ?? "",
            },
          }),
        );
      }}
    >
      <fieldset disabled={disabled} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Pay period</span>
            <select name="payPeriod" className="input" defaultValue={initial.payPeriod}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="semimonthly">Twice a month (1st to 15th, 16th to end)</option>
            </select>
          </label>
          <label className="block"><span className="label">A pay period start date</span><input type="date" name="payPeriodAnchor" className="input" defaultValue={initial.payPeriodAnchor} /><span className="mt-1 block text-xs text-muted">Used for weekly and every two weeks.</span></label>
          <label className="block">
            <span className="label">Workweek starts</span>
            <select name="weekStartsOn" className="input" defaultValue={initial.weekStartsOn}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </label>
          <Num name="overtimeHours" label="Overtime after (hours a week)" value={initial.weeklyOvertimeAfter / 60} min={0} max={168} />
          <Num name="mealAfterHours" label="Meal break due after (hours)" value={initial.mealRequiredAfter / 60} min={0} max={24} />
          <Num name="mealMinMinutes" label="Meal break at least (minutes)" value={initial.mealMinMinutes} min={0} max={120} />
          <Num name="mealStartByHours" label="Meal must start by (hours in)" value={initial.mealStartBy / 60} min={0} max={24} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mealUnpaid" defaultChecked={initial.mealUnpaid} /> Meal breaks are unpaid</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackRestBreaks" defaultChecked={initial.trackRestBreaks} /> Flag shifts with fewer punched rest breaks than expected (one per 4 hours)</label>
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold">Pay</p>
          <p className="text-xs text-muted">Juniper does not run payroll or hold bank details. Use a payroll provider for paychecks and direct deposit. Pay rates are set by an owner on the Pay page and are private.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showPayEstimates" defaultChecked={initial.showPayEstimates} /> Show estimated pay on timesheets (owners)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="employeesSeeOwnPay" defaultChecked={initial.employeesSeeOwnPay} /> Let each person see their own estimate</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Payroll provider name</span><input name="payrollName" className="input" defaultValue={initial.payrollName} placeholder="Gusto" maxLength={60} /></label>
            <label className="block"><span className="label">Payroll sign-in link</span><input name="payrollUrl" type="url" className="input" defaultValue={initial.payrollUrl} placeholder="https://" maxLength={300} /></label>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={pending}>Save</button>
      </fieldset>
    </form>
  );
}

export function VocabularyForm({ initial }: { initial: Vocabulary }) {
  const { act, pending } = useAct();
  const fields: [keyof Vocabulary, string][] = [
    ["staff", "One staff member"],
    ["staffPlural", "Staff (plural)"],
    ["client", "One client"],
    ["clientPlural", "Clients (plural)"],
    ["service", "One service"],
    ["servicePlural", "Services (plural)"],
    ["appointment", "One appointment"],
    ["appointmentPlural", "Appointments (plural)"],
  ];
  return (
    <form className="grid gap-3 sm:grid-cols-4" action={(f) => act(() => updateSettingsAction({ section: "vocabulary", values: formObject(f) }))}>
      {fields.map(([k, label]) => (
        <label key={k} className="block"><span className="label">{label}</span><input name={k} className="input" defaultValue={initial[k]} maxLength={40} /></label>
      ))}
      <div className="sm:col-span-4"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button></div>
    </form>
  );
}

export function EmbedSnippet({ bookingUrl, embedUrl, scriptUrl, slug }: { bookingUrl: string; embedUrl: string; scriptUrl: string; slug: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const snippet = `<div data-juniper-booking="${slug}"></div>\n<script src="${scriptUrl}" async></script>`;
  const copy = (k: string, v: string) => {
    navigator.clipboard?.writeText(v);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="space-y-4 text-sm">
      <div>
        <span className="label">Booking page</span>
        <div className="flex gap-2">
          <input className="input" readOnly value={bookingUrl} aria-label="Booking page link" />
          <button type="button" className="btn btn-soft btn-sm" onClick={() => copy("link", bookingUrl)}>{copied === "link" ? "Copied" : "Copy"}</button>
          <a className="btn btn-soft btn-sm" href={bookingUrl} target="_blank" rel="noreferrer">Open</a>
        </div>
      </div>
      <div>
        <span className="label">Put booking on your website</span>
        <textarea className="input font-mono text-xs" rows={3} readOnly value={snippet} aria-label="Website code" />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-soft btn-sm" onClick={() => copy("snippet", snippet)}>{copied === "snippet" ? "Copied" : "Copy code"}</button>
          <a className="btn btn-ghost btn-sm" href={embedUrl} target="_blank" rel="noreferrer">Preview</a>
        </div>
        <p className="mt-1 text-xs text-muted">Paste it where the booking form should appear. It resizes itself and works on phones. Evergreen sites have this built in.</p>
      </div>
    </div>
  );
}

export function HelcimForm({ initial, webhookBase }: { initial: HelcimSettings; webhookBase: string }) {
  const { act, pending } = useAct();
  const [copied, setCopied] = useState(false);
  const webhookUrl = initial.connectionKey ? `${webhookBase}/${initial.connectionKey}` : null;
  return (
    <div className="space-y-6 text-sm">
      <form className="grid gap-3 sm:grid-cols-2" action={(f) => act(() => saveHelcimConnectionAction(formObject(f)))}>
        <label className="block">
          <span className="label">API token</span>
          <input name="apiToken" type="password" autoComplete="off" className="input" placeholder={initial.connected ? "Saved. Paste a new one to replace it." : "From Helcim, All Tools, Integrations, API Access"} required={!initial.connected} />
        </label>
        <label className="block">
          <span className="label">Webhook verifier token</span>
          <input name="verifierToken" type="password" autoComplete="off" className="input" placeholder={initial.hasVerifierToken ? "Saved. Paste a new one to replace it." : "Shown by Helcim when you add the webhook URL"} />
        </label>
        <label className="block">
          <span className="label">Currency</span>
          <select name="currency" className="input" defaultValue={initial.currency}>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </label>
        <div className="flex items-end"><button className="btn btn-primary btn-sm" disabled={pending}>{initial.connected ? "Save" : "Connect"}</button></div>
      </form>

      {webhookUrl && (
        <div>
          <span className="label">Webhook URL</span>
          <div className="flex gap-2">
            <input className="input" readOnly value={webhookUrl} aria-label="Webhook URL" />
            <button type="button" className="btn btn-soft btn-sm" onClick={() => { navigator.clipboard?.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="mt-1 text-xs text-muted">In Helcim, add this as the webhook URL and turn on Card Transaction and Terminal Cancel events. Helcim then shows a verifier token to paste above. Until that token is saved, payment results are rejected.</p>
        </div>
      )}

      {initial.connected && (
        <div className="space-y-3">
          <h3 className="font-semibold">Devices</h3>
          {initial.devices.length === 0 && <p className="text-muted">No devices yet. Register a device in Helcim, then add the 4 character code it shows.</p>}
          {initial.devices.map((d) => <DeviceRow key={d.id} device={d} />)}
          <DeviceRow />
        </div>
      )}
    </div>
  );
}

function DeviceRow({ device }: { device?: HelcimSettings["devices"][number] }) {
  const { act, pending } = useAct();
  return (
    <form className="grid items-end gap-2 sm:grid-cols-[6rem_9rem_1fr_1fr_auto_auto]" action={(f) => act(() => saveHelcimDeviceAction({ ...formObject(f), id: device?.id, active: f.get("active") === "on" }))}>
      <label className="block"><span className="label">Code</span><input name="code" className="input uppercase" maxLength={4} defaultValue={device?.code} required /></label>
      <label className="block">
        <span className="label">Type</span>
        <select name="kind" className="input" defaultValue={device?.kind ?? "smart_terminal"}>
          <option value="smart_terminal">Smart Terminal</option>
          <option value="card_reader">Card Reader</option>
        </select>
      </label>
      <label className="block"><span className="label">Name</span><input name="label" className="input" placeholder="Front counter" defaultValue={device?.label} required /></label>
      <label className="block"><span className="label">Location</span><input name="location" className="input" defaultValue={device?.location ?? ""} /></label>
      <label className="flex items-center gap-2 pb-2"><input name="active" type="checkbox" defaultChecked={device?.active ?? true} /><span>On</span></label>
      <button className="btn btn-soft btn-sm" disabled={pending}>{device ? "Save" : "Add device"}</button>
    </form>
  );
}

export function ShopForm({ initial }: { initial: WorkspaceSettings["shop"] }) {
  const { act, pending } = useAct();
  return (
    <form className="grid gap-3 sm:grid-cols-3" action={(f) => act(() => updateSettingsAction({ section: "shop", values: { enabled: f.get("enabled") === "on", onlineEnabled: f.get("onlineEnabled") === "on", taxRatePercent: Number(f.get("taxRatePercent") || 0), shippingFlatCents: Math.round(Number(f.get("shipping") || 0) * 100), allowedOrigins: [...new Set(String(f.get("origins") ?? "").split(/[\s,]+/).filter(Boolean).map((o) => normalizeOrigin(o) ?? o))] } }))}>
      <label className="flex items-center gap-2 sm:pt-6"><input name="enabled" type="checkbox" defaultChecked={initial.enabled} /><span>Sell products</span></label>
      <label className="block">
        <span className="label">Sales tax rate (%)</span>
        <input name="taxRatePercent" type="number" step="0.01" min={0} max={15} className="input" defaultValue={initial.taxRatePercent} />
        <span className="mt-1 block text-xs text-muted">Added to product sales at the register. Confirm the rate for your location with your accountant.</span>
      </label>
      <label className="flex items-center gap-2"><input name="onlineEnabled" type="checkbox" defaultChecked={initial.onlineEnabled} /><span>Open the online shop</span></label>
      <label className="block">
        <span className="label">Flat shipping ($)</span>
        <input name="shipping" type="number" step="0.01" min={0} max={1000} className="input" defaultValue={(initial.shippingFlatCents / 100).toFixed(2)} />
        <span className="mt-1 block text-xs text-muted">Charged once on online orders that ship. Needs Helcim connected.</span>
      </label>
      <label className="block sm:col-span-3">
        <span className="label">Websites that can use the shop API</span>
        <textarea name="origins" className="input font-mono text-xs" rows={2} defaultValue={initial.allowedOrigins.join("\n")} placeholder="https://shop.yourbusiness.com" />
        <span className="mt-1 block text-xs text-muted">One address per line, https only. Your own site calls Juniper for products and checkout. Leave empty if you only use the shop page here.</span>
      </label>
      <div className="flex items-end"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button></div>
    </form>
  );
}
