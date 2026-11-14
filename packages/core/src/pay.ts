import type { PayPeriodKind } from "./timesheet";

// Estimated gross pay from a timesheet. An estimate only: no taxes, tips, commission, bonuses or time off.

export type PayType = "hourly" | "salary";
export interface PayProfile {
  payType: PayType;
  /** Hourly: cents per hour. Salary: cents per year. */
  payRateCents: number;
}

export const PERIODS_PER_YEAR: Record<PayPeriodKind, number> = { weekly: 52, biweekly: 26, semimonthly: 24 };
export const OVERTIME_MULTIPLIER = 1.5;

/**
 * Hourly people: regular hours at their rate plus overtime at 1.5x.
 * Salaried people: one period's share of the year, with no overtime.
 * Returns null when no pay profile is set.
 */
export function estimatePay(profile: PayProfile | null, sheet: { regularMinutes: number; overtimeMinutes: number }, period: PayPeriodKind): number | null {
  if (!profile) return null;
  if (profile.payType === "salary") return Math.round(profile.payRateCents / PERIODS_PER_YEAR[period]);
  const regular = (sheet.regularMinutes / 60) * profile.payRateCents;
  const overtime = (sheet.overtimeMinutes / 60) * profile.payRateCents * OVERTIME_MULTIPLIER;
  return Math.round(regular + overtime);
}

/** "Ana Maria Lopez" becomes first "Ana", last "Maria Lopez". One word is all first name. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}
