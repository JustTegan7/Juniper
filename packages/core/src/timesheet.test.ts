import { describe, expect, it } from "vitest";
import { buildTimesheet, payPeriodFor, summarizePunch, weekStart, WA_TIME_RULES, type Punch } from "./timesheet";
import { parseHm, zonedToUtc } from "./zoned";
import { parseSettings, parsePrice, formatPrice, slugify, slugSchema, vocabularyFor } from "./business";

const TZ = "America/Los_Angeles";
const at = (day: string, hm: string) => zonedToUtc(day, parseHm(hm)!, TZ).getTime();
let n = 0;
const shift = (day: string, from: string, to: string, breaks: Punch["breaks"] = []): Punch => ({
  id: String(++n),
  clockIn: at(day, from),
  clockOut: at(day, to),
  breaks,
});
const meal = (day: string, from: string, to: string) => ({ start: at(day, from), end: at(day, to), kind: "meal" as const });

describe("punch summaries", () => {
  it("subtracts unpaid meals and keeps rest breaks paid", () => {
    const s = summarizePunch(
      shift("2026-11-10", "9:00", "17:30", [meal("2026-11-10", "12:00", "12:30"), { start: at("2026-11-10", "15:00"), end: at("2026-11-10", "15:10"), kind: "rest" }]),
      TZ,
      0,
    );
    expect(s.workedMinutes).toBe(480);
    expect(s.restMinutes).toBe(10);
    expect(s.flags).toEqual([]);
  });
  it("flags missing, short and late meals", () => {
    expect(summarizePunch(shift("2026-11-10", "9:00", "15:00"), TZ, 0).flags).toEqual(["missed_meal"]);
    expect(summarizePunch(shift("2026-11-10", "9:00", "15:00", [meal("2026-11-10", "12:00", "12:15")]), TZ, 0).flags).toEqual(["short_meal"]);
    expect(summarizePunch(shift("2026-11-10", "9:00", "17:00", [meal("2026-11-10", "14:30", "15:00")]), TZ, 0).flags).toEqual(["late_meal"]);
    expect(summarizePunch(shift("2026-11-10", "9:00", "14:00"), TZ, 0).flags).toEqual([]);
  });
  it("counts open shifts up to now", () => {
    const p: Punch = { id: "x", clockIn: at("2026-11-10", "9:00"), clockOut: null, breaks: [] };
    const s = summarizePunch(p, TZ, at("2026-11-10", "10:15"));
    expect(s.workedMinutes).toBe(75);
    expect(s.flags).toContain("open");
  });
});

describe("timesheets", () => {
  it("puts weekly overtime on the day it crosses 40 hours", () => {
    // Sun 2026-11-08 starts the week. Five 9 hour days (with meals) = 45 hours.
    const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    const punches = days.map((d) => shift(d, "8:00", "17:30", [meal(d, "12:00", "12:30")]));
    const ts = buildTimesheet(punches, { start: "2026-11-08", end: "2026-11-21", timeZone: TZ, now: 0 });
    expect(ts.workedMinutes).toBe(45 * 60);
    expect(ts.overtimeMinutes).toBe(5 * 60);
    expect(ts.days.find((d) => d.day === "2026-11-13")!.overtimeMinutes).toBe(5 * 60);
    expect(ts.days.find((d) => d.day === "2026-11-12")!.overtimeMinutes).toBe(0);
    expect(ts.days).toHaveLength(14);
  });
  it("counts overtime from earlier in a workweek that started before the period", () => {
    const punches = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"].map((d) => shift(d, "8:00", "19:30", [meal(d, "12:00", "12:30")]));
    // 11 hours a day. Period starts Mon the 16th (semimonthly) inside the Sun-15 workweek.
    const ts = buildTimesheet(punches, { start: "2026-11-16", end: "2026-11-30", timeZone: TZ, now: 0 });
    expect(ts.workedMinutes).toBe(33 * 60);
    expect(ts.overtimeMinutes).toBe(4 * 60);
  });
  it("finds pay periods", () => {
    expect(payPeriodFor("2026-11-20", "semimonthly", "2026-01-01")).toEqual({ start: "2026-11-16", end: "2026-11-30" });
    expect(payPeriodFor("2026-02-03", "semimonthly", "2026-01-01")).toEqual({ start: "2026-02-01", end: "2026-02-15" });
    expect(payPeriodFor("2026-11-20", "biweekly", "2026-01-04")).toEqual({ start: "2026-11-08", end: "2026-11-21" });
    expect(payPeriodFor("2026-11-20", "weekly", "2026-01-04")).toEqual({ start: "2026-11-15", end: "2026-11-21" });
    expect(weekStart("2026-11-20", 0)).toBe("2026-11-15");
    expect(WA_TIME_RULES.weeklyOvertimeAfter).toBe(2400);
  });
});

describe("business settings", () => {
  it("fills defaults and keeps overrides", () => {
    const s = parseSettings({ booking: { slotStep: 30 } });
    expect(s.booking.slotStep).toBe(30);
    expect(s.booking.cancelWindowHours).toBe(24);
    expect(s.time.payPeriod).toBe("biweekly");
    expect(parseSettings(null).booking.enabled).toBe(true);
  });
  it("uses industry words with business overrides", () => {
    expect(vocabularyFor("salon", {}).staff).toBe("Stylist");
    expect(vocabularyFor("salon", { staff: "Artist", client: " " }).staff).toBe("Artist");
    expect(vocabularyFor("unknown", null).staff).toBe("Staff member");
  });
  it("makes safe link names", () => {
    expect(slugify("Barclay's Salon")).toBe("barclays-salon");
    expect(slugSchema.safeParse("admin").success).toBe(false);
    expect(slugSchema.safeParse("barclays").success).toBe(true);
    expect(slugSchema.safeParse("-x").success).toBe(false);
  });
  it("reads and writes prices", () => {
    expect(parsePrice("$60.50")).toBe(6050);
    expect(parsePrice("abc")).toBeNull();
    expect(formatPrice(6000, true)).toBe("$60+");
    expect(formatPrice(6050)).toBe("$60.50");
  });
});
