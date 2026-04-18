/** Minimum lead time for a custom pickup / delivery slot (minutes). */
export const ORDER_SCHEDULE_MIN_LEAD_MINUTES = 30;

/** Latest day you can schedule ahead (from now). */
export const ORDER_SCHEDULE_MAX_DAYS_AHEAD = 14;

export type ScheduleMode = "asap" | "scheduled";

export function getMinScheduleDateFromNow(now: Date = new Date()): Date {
  return new Date(
    now.getTime() + ORDER_SCHEDULE_MIN_LEAD_MINUTES * 60 * 1000,
  );
}

export function getMaxScheduleDateFromNow(now: Date = new Date()): Date {
  return new Date(
    now.getTime() + ORDER_SCHEDULE_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  );
}

export function dateToDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse value from `<input type="datetime-local" />` in the user's local timezone. */
export function parseDatetimeLocalValue(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const h = Number(m[4]);
  const min = Number(m[5]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23 || min > 59) {
    return null;
  }
  const d = new Date(y, mo - 1, day, h, min, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function isScheduledTimeAllowed(
  chosen: Date,
  now: Date = new Date(),
): boolean {
  const min = getMinScheduleDateFromNow(now);
  const max = getMaxScheduleDateFromNow(now);
  const t = chosen.getTime();
  return t >= min.getTime() && t <= max.getTime();
}

export function formatScheduleHuman(
  mode: ScheduleMode,
  scheduledAt: Date | null,
): string {
  if (mode === "asap") return "As soon as possible";
  if (!scheduledAt) return "Scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(scheduledAt);
}
