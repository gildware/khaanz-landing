import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";

/**
 * P&L / daily-report go-live day (YYYY-MM-DD, IST).
 * Days before this do not accrue auto salaries.
 * Set REPORTING_START_DATE in env (e.g. 2026-07-15). Empty = no cutoff.
 */
export function getReportingStartDayKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.REPORTING_START_DATE?.trim() ?? "";
  if (!raw) return null;
  if (!parseIstDateInput(raw)) return null;
  return raw;
}

/** True when dayKey is on or after the configured go-live date (or no cutoff). */
export function isOnOrAfterReportingStart(
  dayKey: string,
  startKey: string | null = getReportingStartDayKey(),
): boolean {
  if (!startKey) return true;
  return dayKey >= startKey;
}

/** Filter day keys to those on/after go-live. */
export function filterDayKeysFromReportingStart(
  dayKeys: string[],
  startKey: string | null = getReportingStartDayKey(),
): string[] {
  if (!startKey) return dayKeys;
  return dayKeys.filter((k) => k >= startKey);
}

/** IST day key for an employee's join date, or null if unset. */
export function employeeJoinDayKey(joinedAt: Date | null | undefined): string | null {
  if (!joinedAt || Number.isNaN(joinedAt.getTime())) return null;
  return formatIstDateInput(joinedAt);
}
