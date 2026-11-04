import { describe, expect, it } from "vitest";
import { buildRequest, canCancel, canReview, dayFromPicker, pickerDate, pickerTime, timeFromPicker, toDay, validateRange } from "./time-off";

const now = new Date("2026-11-09T12:00:00.000Z");
const mine = { membershipId: "m-me" };
const theirs = { membershipId: "m-other" };
const req = (who: { membershipId: string }, status: "pending" | "approved" | "denied" | "cancelled", endsAt = "2026-11-12T00:00:00.000Z") => ({ ...who, status, endsAt });

describe("canReview", () => {
  it("lets owners and managers review other people's pending requests", () => {
    expect(canReview({ role: "owner", membershipId: "m-me" }, req(theirs, "pending"))).toBe(true);
    expect(canReview({ role: "manager", membershipId: "m-me" }, req(theirs, "pending"))).toBe(true);
  });

  it("hides the buttons from team members", () => {
    expect(canReview({ role: "member", membershipId: "m-me" }, req(theirs, "pending"))).toBe(false);
    expect(canReview({ role: "member", membershipId: "m-me" }, req(mine, "pending"))).toBe(false);
  });

  it("hides the buttons on a manager's own request, but not an owner's (the server allows owners)", () => {
    expect(canReview({ role: "manager", membershipId: "m-me" }, req(mine, "pending"))).toBe(false);
    expect(canReview({ role: "owner", membershipId: "m-me" }, req(mine, "pending"))).toBe(true);
  });

  it("only offers review on pending requests", () => {
    for (const s of ["approved", "denied", "cancelled"] as const) expect(canReview({ role: "owner", membershipId: "m-me" }, req(theirs, s))).toBe(false);
  });
});

describe("canCancel", () => {
  const me = { role: "member" as const, membershipId: "m-me" };
  it("lets you cancel your own pending request", () => {
    expect(canCancel(me, req(mine, "pending"), now)).toBe(true);
  });

  it("lets you cancel your own approved request that is not over", () => {
    expect(canCancel(me, req(mine, "approved", "2026-11-12T00:00:00.000Z"), now)).toBe(true);
    expect(canCancel(me, req(mine, "approved", "2026-11-09T12:00:00.000Z"), now)).toBe(false);
    expect(canCancel(me, req(mine, "approved", "2026-11-01T00:00:00.000Z"), now)).toBe(false);
  });

  it("does not offer cancel on closed requests or on other people's", () => {
    expect(canCancel(me, req(mine, "denied"), now)).toBe(false);
    expect(canCancel(me, req(mine, "cancelled"), now)).toBe(false);
    expect(canCancel(me, req(theirs, "pending"), now)).toBe(false);
    expect(canCancel({ role: "owner", membershipId: "m-me" }, req(theirs, "pending"), now)).toBe(false);
  });
});

describe("picker conversion", () => {
  it("round trips a day without shifting it", () => {
    for (const day of ["2026-01-01", "2026-03-08", "2026-11-01", "2026-12-31", "2028-02-29"]) expect(dayFromPicker(pickerDate(day))).toBe(day);
  });

  it("round trips a time", () => {
    for (const hm of ["00:00", "09:05", "13:30", "23:59"]) expect(timeFromPicker(pickerTime(hm))).toBe(hm);
  });

  it("pads day parts", () => {
    expect(toDay(2026, 3, 4)).toBe("2026-03-04");
    expect(dayFromPicker(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("validateRange", () => {
  it("only complains when the last day is before the first", () => {
    expect(validateRange("2026-11-10", "2026-11-09")).toBe("The last day must be on or after the first day.");
    expect(validateRange("2026-11-10", "2026-11-10")).toBeNull();
    expect(validateRange("2026-11-10", "2026-11-12")).toBeNull();
  });
});

describe("buildRequest", () => {
  const form = { startDay: "2026-11-10", endDay: "2026-11-10", allDay: true, startTime: "09:00", endTime: "17:00", reason: "  " };
  it("leaves out times for all day and an empty reason", () => {
    expect(buildRequest(form)).toEqual({ startDay: "2026-11-10", endDay: "2026-11-10", allDay: true });
  });

  it("sends times for a part day and a trimmed reason", () => {
    expect(buildRequest({ ...form, allDay: false, reason: " Dentist " })).toEqual({ startDay: "2026-11-10", endDay: "2026-11-10", allDay: false, startTime: "09:00", endTime: "17:00", reason: "Dentist" });
  });
});
