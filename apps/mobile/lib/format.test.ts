import { describe, expect, it } from "vitest";
import { breakLabel, breakLength, clockButtons, dayRange, elapsedMs, elapsedTimer, emptyToday, formatTimer, price, statusActions, timeOffWhen } from "./format";

const vocab = { staff: "Stylist", staffPlural: "Stylists", client: "Client", clientPlural: "Clients", service: "Service", servicePlural: "Services", appointment: "Appointment", appointmentPlural: "Appointments" };

describe("statusActions", () => {
  it("offers the next steps for each status, with cancel last", () => {
    expect(statusActions("booked").map((a) => a.status)).toEqual(["confirmed", "checked_in", "no_show", "cancelled"]);
    expect(statusActions("confirmed").map((a) => a.status)).toEqual(["checked_in", "no_show", "cancelled"]);
    expect(statusActions("checked_in").map((a) => a.status)).toEqual(["completed", "no_show", "cancelled"]);
  });

  it("offers nothing once an appointment is finished", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) expect(statusActions(s)).toEqual([]);
  });

  it("marks only cancel as destructive", () => {
    const all = (["booked", "confirmed", "checked_in"] as const).flatMap(statusActions);
    expect(all.filter((a) => a.destructive).every((a) => a.status === "cancelled")).toBe(true);
  });
});

describe("display text", () => {
  it("uses the business's own words", () => {
    expect(emptyToday(vocab, "mine")).toBe("No appointments for you today.");
    expect(emptyToday({ ...vocab, appointmentPlural: "Sessions" }, "all")).toBe("No sessions on the calendar today.");
  });

  it("formats prices", () => {
    expect(price(6500)).toBe("$65");
    expect(price(6550)).toBe("$65.50");
  });
});

describe("timers", () => {
  const start = "2026-11-09T17:00:00.000Z";
  const at = (iso: string) => new Date(iso);

  it("formats a running timer, with hours only from one hour", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(9_000)).toBe("0:09");
    expect(formatTimer(309_000)).toBe("5:09");
    expect(formatTimer(3_599_999)).toBe("59:59");
    expect(formatTimer(3_600_000)).toBe("1:00:00");
    expect(formatTimer(3_909_000)).toBe("1:05:09");
    expect(formatTimer(36_000_000 + 61_000)).toBe("10:01:01");
  });

  it("measures from the clock in to the now that is passed in", () => {
    expect(elapsedTimer(start, at("2026-11-09T17:00:00.000Z"))).toBe("0:00");
    expect(elapsedTimer(start, at("2026-11-09T18:05:09.900Z"))).toBe("1:05:09");
    expect(elapsedMs(start, at("2026-11-09T17:00:01.500Z"))).toBe(1500);
  });

  it("never goes negative when the phone clock is behind", () => {
    expect(elapsedMs(start, at("2026-11-09T16:59:58.000Z"))).toBe(0);
    expect(elapsedTimer(start, at("2026-11-09T16:59:58.000Z"))).toBe("0:00");
    expect(formatTimer(-5000)).toBe("0:00");
  });

  it("shows an open break as a timer and a finished break in minutes", () => {
    expect(breakLength({ startsAt: start, endsAt: null }, at("2026-11-09T17:12:30.000Z"))).toBe("12:30");
    expect(breakLength({ startsAt: start, endsAt: "2026-11-09T17:30:59.000Z" }, at("2026-11-10T00:00:00.000Z"))).toBe("30 min");
    expect(breakLength({ startsAt: start, endsAt: "2026-11-09T18:15:00.000Z" }, at("2026-11-10T00:00:00.000Z"))).toBe("1 hr 15 min");
    expect(breakLength({ startsAt: start, endsAt: "2026-11-09T17:00:40.000Z" }, at("2026-11-10T00:00:00.000Z"))).toBe("Under 1 min");
  });

  it("names breaks", () => {
    expect(breakLabel("meal")).toBe("Meal break");
    expect(breakLabel("rest")).toBe("Rest break");
  });
});

describe("clockButtons", () => {
  const brk = { id: "b" };
  it("offers only Clock in when not clocked in, even if a stale break is passed", () => {
    expect(clockButtons({ clockedIn: false, openBreak: null }, true)).toEqual({ clockIn: true, clockOut: false, startMeal: false, startRest: false, endBreak: false });
    expect(clockButtons({ clockedIn: false, openBreak: brk }, true).endBreak).toBe(false);
  });

  it("offers Clock out and break starts while clocked in with no break open", () => {
    expect(clockButtons({ clockedIn: true, openBreak: null }, true)).toEqual({ clockIn: false, clockOut: true, startMeal: true, startRest: true, endBreak: false });
  });

  it("hides the rest break unless the business tracks rest breaks", () => {
    expect(clockButtons({ clockedIn: true, openBreak: null }, false)).toMatchObject({ startMeal: true, startRest: false });
  });

  it("offers only End break while a break is open", () => {
    expect(clockButtons({ clockedIn: true, openBreak: brk }, true)).toEqual({ clockIn: false, clockOut: true, startMeal: false, startRest: false, endBreak: true });
  });
});

describe("time off text", () => {
  it("formats day ranges", () => {
    expect(dayRange("2026-11-09", "2026-11-09")).toBe("Mon, Nov 9");
    expect(dayRange("2026-11-09", "2026-11-11")).toBe("Mon, Nov 9 to Wed, Nov 11");
  });

  it("says all day, or the hours in the business time zone", () => {
    const tz = "America/Los_Angeles";
    const base = { startDay: "2026-11-10", endDay: "2026-11-10", startsAt: "2026-11-10T17:00:00.000Z", endsAt: "2026-11-10T21:30:00.000Z" };
    expect(timeOffWhen({ ...base, allDay: true }, tz)).toBe("Tue, Nov 10, all day");
    expect(timeOffWhen({ ...base, allDay: false }, tz)).toBe("Tue, Nov 10, 9 AM to 1:30 PM");
    expect(timeOffWhen({ ...base, endDay: "2026-11-11", endsAt: "2026-11-11T21:30:00.000Z", allDay: false }, tz)).toBe("Tue, Nov 10, 9 AM to Wed, Nov 11, 1:30 PM");
  });
});
