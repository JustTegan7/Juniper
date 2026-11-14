import { describe, expect, it } from "vitest";
import { estimatePay, splitName } from "./pay";
import { parseSettings } from "./business";

describe("estimatePay", () => {
  const hourly = { payType: "hourly" as const, payRateCents: 2000 };
  it("pays regular hours plus overtime at one and a half", () => {
    expect(estimatePay(hourly, { regularMinutes: 40 * 60, overtimeMinutes: 2 * 60 }, "weekly")).toBe(80000 + 6000);
  });
  it("rounds to the cent", () => {
    expect(estimatePay({ payType: "hourly", payRateCents: 1851 }, { regularMinutes: 7, overtimeMinutes: 0 }, "weekly")).toBe(216);
  });
  it("gives salaried people a share of the year and ignores overtime", () => {
    const salary = { payType: "salary" as const, payRateCents: 5_200_000 };
    expect(estimatePay(salary, { regularMinutes: 0, overtimeMinutes: 600 }, "weekly")).toBe(100000);
    expect(estimatePay(salary, { regularMinutes: 0, overtimeMinutes: 0 }, "biweekly")).toBe(200000);
    expect(estimatePay(salary, { regularMinutes: 0, overtimeMinutes: 0 }, "semimonthly")).toBe(216667);
  });
  it("is null without a profile", () => {
    expect(estimatePay(null, { regularMinutes: 600, overtimeMinutes: 0 }, "weekly")).toBeNull();
  });
});

describe("splitName", () => {
  it("splits first and last", () => {
    expect(splitName("Ana Maria Lopez")).toEqual({ first: "Ana", last: "Maria Lopez" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
  });
});

describe("pay settings", () => {
  it("default off, and a payroll link must be https", () => {
    const t = parseSettings({}).time;
    expect(t).toMatchObject({ showPayEstimates: false, employeesSeeOwnPay: false, payrollName: "", payrollUrl: "" });
    expect(parseSettings({ time: { payrollUrl: "http://x.test" } }).time.payrollUrl).toBe("");
    expect(parseSettings({ time: { payrollUrl: "https://payroll.test/login" } }).time.payrollUrl).toBe("https://payroll.test/login");
  });
});
