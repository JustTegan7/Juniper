// Day-level date helpers. Dates are "YYYY-MM-DD" strings, never times.

export type Ymd = string;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: string): v is Ymd {
  return YMD.test(v);
}

/** "Today" in a given IANA time zone. `now` is passed in so callers control the clock. */
export function todayIn(timeZone: string, now: Date): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: Ymd, days: number): Ymd {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: Ymd, b: Ymd): number {
  const toUtc = (s: Ymd) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

export function maxYmd(a: Ymd, b: Ymd): Ymd {
  return a >= b ? a : b;
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(due: Ymd, today: Ymd): DueState {
  const d = diffDays(due, today);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "soon";
  return "later";
}

/** Human label like "Today", "Tomorrow", "2 days ago", "Mon, Nov 3". */
export function dueLabel(due: Ymd, today: Ymd): string {
  const d = diffDays(due, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d} days late`;
  if (d < 7) {
    const [y, m, day] = due.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  }
  const [y, m, day] = due.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
