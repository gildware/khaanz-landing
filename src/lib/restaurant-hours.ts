import type { RestaurantSettingsPayload, TimeRange } from "@/types/restaurant-settings";

export function minutesFromHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Inclusive start, exclusive end (e.g. end 23:00 means open through 22:59). */
export function isOpenDuringRange(now: Date, range: TimeRange): boolean {
  const start = minutesFromHHMM(range.start);
  const end = minutesFromHHMM(range.end);
  if (start === null || end === null) return false;
  const m = minutesOfDay(now);
  return m >= start && m < end;
}

export function isPickupOpen(
  settings: RestaurantSettingsPayload,
  now: Date = new Date(),
): boolean {
  return isOpenDuringRange(now, settings.pickup);
}

export function isDeliveryOpen(
  settings: RestaurantSettingsPayload,
  now: Date = new Date(),
): boolean {
  return isOpenDuringRange(now, settings.delivery);
}

/** True if either channel can accept orders (for legacy callers). */
export function isAnyOrderingOpen(
  settings: RestaurantSettingsPayload,
  now: Date = new Date(),
): boolean {
  return isPickupOpen(settings, now) || isDeliveryOpen(settings, now);
}

export function formatTime12h(hhmm: string): string {
  const total = minutesFromHHMM(hhmm);
  if (total === null) return hhmm;
  const h = Math.floor(total / 60);
  const min = total % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min.toString().padStart(2, "0")} ${period}`;
}

export function formatRangeLabel(range: TimeRange): string {
  return `${formatTime12h(range.start)} – ${formatTime12h(range.end)}`;
}
