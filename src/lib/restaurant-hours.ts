import type { RestaurantSettingsPayload, TimeRange } from "@/types/restaurant-settings";

/** Any settings shape that includes pickup/delivery windows (public API or full admin payload). */
export type RestaurantHoursSettings = Pick<
  RestaurantSettingsPayload,
  "pickup" | "delivery"
>;

/** Opening hours in settings are wall-clock times in this zone (India). */
const RESTAURANT_TZ = "Asia/Kolkata";

export function minutesFromHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Minutes since midnight in the restaurant timezone. Using `getHours()` on the
 * server vs the phone would mix UTC and IST and break SSR hydration for any UI
 * that depends on open/closed (e.g. checkout).
 */
export function minutesOfDayInRestaurantTz(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESTAURANT_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  let h = 0;
  let min = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value);
    if (p.type === "minute") min = Number(p.value);
  }
  return h * 60 + min;
}

/** @deprecated Prefer {@link minutesOfDayInRestaurantTz} for ordering hours. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Inclusive start, exclusive end (e.g. end 23:00 means open through 22:59). */
export function isOpenDuringRange(now: Date, range: TimeRange): boolean {
  const start = minutesFromHHMM(range.start);
  const end = minutesFromHHMM(range.end);
  if (start === null || end === null) return false;
  const m = minutesOfDayInRestaurantTz(now);
  return m >= start && m < end;
}

export function isPickupOpen(
  settings: RestaurantHoursSettings,
  now: Date = new Date(),
): boolean {
  return isOpenDuringRange(now, settings.pickup);
}

export function isDeliveryOpen(
  settings: RestaurantHoursSettings,
  now: Date = new Date(),
): boolean {
  return isOpenDuringRange(now, settings.delivery);
}

/** Whether `when` falls in the pickup or delivery window (wall clock in restaurant TZ). */
export function isChannelOpenAt(
  settings: RestaurantHoursSettings,
  channel: "pickup" | "delivery",
  when: Date,
): boolean {
  const range = channel === "pickup" ? settings.pickup : settings.delivery;
  return isOpenDuringRange(when, range);
}

/** True if either channel can accept orders (for legacy callers). */
export function isAnyOrderingOpen(
  settings: RestaurantHoursSettings,
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
