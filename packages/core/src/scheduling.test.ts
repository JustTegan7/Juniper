import { describe, expect, it } from "vitest";
import {
  busySegments,
  clientCanChange,
  hoursForDay,
  intersectWindows,
  mergedStarts,
  openSlots,
  pickStaff,
  type ServiceTiming,
} from "./availability";
import { formatMinutes, parseHm, utcToZoned, zonedToUtc } from "./zoned";

const TZ = "America/Los_Angeles";
const at = (day: string, hm: string) => zonedToUtc(day, parseHm(hm)!, TZ).getTime();

describe("time zones", () => {
  it("converts Pacific wall time both ways, standard and daylight", () => {
    expect(zonedToUtc("2026-11-10", 9 * 60, TZ).toISOString()).toBe("2026-11-10T17:00:00.000Z");
    expect(zonedToUtc("2026-07-10", 9 * 60, TZ).toISOString()).toBe("2026-07-10T16:00:00.000Z");
    expect(utcToZoned(new Date("2026-07-10T16:00:00Z"), TZ)).toEqual({ day: "2026-07-10", minutes: 540, weekday: 5 });
  });
  it("handles the change days", () => {
    // 2026-03-08 spring forward: 2:30 AM does not exist, lands at 3:30 AM PDT.
    expect(zonedToUtc("2026-03-08", 150, TZ).toISOString()).toBe("2026-03-08T10:30:00.000Z");
    expect(zonedToUtc("2026-03-08", 10 * 60, TZ).toISOString()).toBe("2026-03-08T17:00:00.000Z");
    // 2026-11-01 fall back: 10 AM is PST.
    expect(zonedToUtc("2026-11-01", 10 * 60, TZ).toISOString()).toBe("2026-11-01T18:00:00.000Z");
    // Late evening stays on the same local day.
    expect(utcToZoned(zonedToUtc("2026-11-02", 23 * 60 + 30, TZ), TZ).day).toBe("2026-11-02");
  });
  it("parses and formats clock times", () => {
    expect(parseHm("9:30")).toBe(570);
    expect(parseHm("25:00")).toBeNull();
    expect(formatMinutes(570)).toBe("9:30 AM");
    expect(formatMinutes(720)).toBe("12 PM");
    expect(formatMinutes(0)).toBe("12 AM");
  });
});

const color: ServiceTiming = { activeBefore: 30, processing: 30, activeAfter: 30, bufferAfter: 0 };
const cut: ServiceTiming = { activeBefore: 45, processing: 0, activeAfter: 0, bufferAfter: 0 };

describe("busy segments", () => {
  it("frees the staff member during processing", () => {
    const s = at("2026-11-10", "10:00");
    expect(busySegments(s, color)).toEqual([
      { start: s, end: s + 30 * 60_000 },
      { start: s + 60 * 60_000, end: s + 90 * 60_000 },
    ]);
  });
  it("adds cleanup to the end", () => {
    const s = at("2026-11-10", "10:00");
    expect(busySegments(s, { ...cut, bufferAfter: 15 })).toEqual([{ start: s, end: s + 60 * 60_000 }]);
  });
});

describe("working hours", () => {
  const weekly = [
    { weekday: 2, start: 540, end: 780 },
    { weekday: 2, start: 840, end: 1080 },
  ];
  it("uses the weekly pattern, split shifts included", () => {
    expect(hoursForDay("2026-11-10", weekly)).toEqual([
      { start: 540, end: 780 },
      { start: 840, end: 1080 },
    ]);
    expect(hoursForDay("2026-11-11", weekly)).toEqual([]);
  });
  it("lets a dated override replace the day or mark it off", () => {
    expect(hoursForDay("2026-11-10", weekly, [{ day: "2026-11-10", start: 600, end: 900 }])).toEqual([{ start: 600, end: 900 }]);
    expect(hoursForDay("2026-11-10", weekly, [{ day: "2026-11-10", start: null, end: null }])).toEqual([]);
  });
  it("keeps staff inside business hours", () => {
    expect(intersectWindows([{ start: 480, end: 1200 }], [{ start: 540, end: 1080 }])).toEqual([{ start: 540, end: 1080 }]);
  });
});

describe("open slots", () => {
  const day = "2026-11-10";
  const now = new Date("2026-11-01T12:00:00Z");
  const base = { day, timeZone: TZ, now, step: 30, minLeadMinutes: 120 };

  it("offers starts that fit inside the window", () => {
    const [s] = openSlots({ ...base, timing: cut, staff: [{ id: "a", windows: [{ start: 540, end: 660 }], busy: [] }] });
    expect(s.starts).toEqual([at(day, "9:00"), at(day, "9:30"), at(day, "10:00")]);
  });

  it("books a haircut during someone's color processing", () => {
    const colorStart = at(day, "9:00");
    const busy = busySegments(colorStart, color); // 9:00-9:30 and 10:00-10:30
    const [s] = openSlots({ ...base, step: 15, timing: { activeBefore: 30, processing: 0, activeAfter: 0, bufferAfter: 0 }, staff: [{ id: "a", windows: [{ start: 540, end: 660 }], busy }] });
    expect(s.starts).toContain(at(day, "9:30"));
    expect(s.starts).not.toContain(at(day, "9:45"));
    expect(s.starts).toContain(at(day, "10:30"));
  });

  it("respects lead time and time off", () => {
    const soon = new Date(at(day, "8:00"));
    const [s] = openSlots({
      ...base,
      now: soon,
      timing: cut,
      staff: [{ id: "a", windows: [{ start: 540, end: 720 }], busy: [{ start: at(day, "11:00"), end: at(day, "12:00") }] }],
    });
    expect(s.starts).toEqual([at(day, "10:00")]);
  });

  it("merges and picks the least busy staff for any available", () => {
    const slots = [
      { staffId: "a", starts: [1, 2] },
      { staffId: "b", starts: [2, 3] },
    ];
    expect(mergedStarts(slots)).toEqual([1, 2, 3]);
    expect(pickStaff(2, slots, { a: 120, b: 30 })).toBe("b");
    expect(pickStaff(1, slots, {})).toBe("a");
    expect(pickStaff(9, slots, {})).toBeNull();
  });

  it("knows when a client can still change online", () => {
    expect(clientCanChange(25 * 3_600_000, 0, 24)).toBe(true);
    expect(clientCanChange(23 * 3_600_000, 0, 24)).toBe(false);
  });
});
