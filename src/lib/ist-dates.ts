/** IST (Asia/Kolkata) date helpers for reporting. */

export function istDateParts(now: Date): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d2 = parts.find((p) => p.type === "day")?.value ?? "01";
  return { y, m, d: d2 };
}

export function istMonthKey(now: Date): string {
  const { y, m } = istDateParts(now);
  return `${y}-${m}`;
}

export function istStartOfDay(now: Date): Date {
  const { y, m, d: day } = istDateParts(now);
  return new Date(`${y}-${m}-${day}T00:00:00+05:30`);
}

export function istStartOfMonth(now: Date): Date {
  const { y, m } = istDateParts(now);
  return new Date(`${y}-${m}-01T00:00:00+05:30`);
}

export function istStartOfNextMonth(now: Date): Date {
  const { y, m } = istDateParts(now);
  const year = Number(y);
  const month = Number(m);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return new Date(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+05:30`,
  );
}

export function istStartOfPreviousMonth(now: Date): Date {
  const start = istStartOfMonth(now);
  const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return istStartOfMonth(prev);
}

export function istDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}

export function istHourFromDate(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

export function formatIstHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/** Parse YYYY-MM-DD as IST midnight start. */
export function parseIstDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date to YYYY-MM-DD in IST. */
export function formatIstDateInput(d: Date): string {
  const { y, m, d: day } = istDateParts(d);
  return `${y}-${m}-${day}`;
}

/** List YYYY-MM month keys touched by [from, toExclusive). */
export function istMonthKeysInRange(from: Date, toExclusive: Date): string[] {
  const keys: string[] = [];
  let cursor = istStartOfMonth(from);
  while (cursor < toExclusive) {
    keys.push(istMonthKey(cursor));
    cursor = istStartOfNextMonth(cursor);
  }
  return keys;
}

export function istDayKey(d: Date): string {
  const { y, m, d: day } = istDateParts(d);
  return `${y}-${m}-${day}`;
}
