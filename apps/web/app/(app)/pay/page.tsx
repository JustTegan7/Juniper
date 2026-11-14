import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, requireModule } from "../../../lib/services/ctx";
import { listPayProfiles } from "../../../lib/services/pay";
import { PayRates } from "./PayRates";

export const metadata: Metadata = { title: "Pay" };

/** Owners set each person's pay rate here. Nobody else can open it. */
export default async function PayPage() {
  const ctx = await getCtx();
  requireModule(ctx, "timeclock");
  if (ctx.role !== "owner") redirect("/timesheets");
  const rows = await listPayProfiles(ctx);
  const t = ctx.workspace.settings.time;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Pay</h1>
      <p className="max-w-2xl text-sm text-muted">
        Rates let timesheets show an estimate of gross pay, before taxes, tips, bonuses and time off. Hourly people get overtime at 1.5 times. Salaried people get one period&apos;s share of the year and no overtime.
        Real paychecks and direct deposit happen in your payroll provider{t.payrollName ? ` (${t.payrollName})` : ""}, never here. Estimates are {t.showPayEstimates ? "on" : "off"}; change that in Settings.
      </p>
      <PayRates rows={rows.map((r) => ({ membershipId: r.membershipId, name: r.name, payType: r.profile?.payType ?? "", rate: r.profile ? (r.profile.payRateCents / 100).toFixed(2) : "" }))} />
    </div>
  );
}
