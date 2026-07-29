import type { WastageType } from "@prisma/client";

import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";

export const WASTAGE_TYPES: WastageType[] = [
  "SPOILAGE",
  "PREPARATION",
  "OVERPRODUCTION",
  "OTHER",
];

export function isWastageType(x: unknown): x is WastageType {
  return typeof x === "string" && WASTAGE_TYPES.includes(x as WastageType);
}

/** Accepts YYYY-MM-DD (IST midnight) or an ISO datetime. Empty → now. */
export function resolveWastedAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return new Date();
  const trimmed = raw.trim();
  const ist = parseIstDateInput(trimmed);
  if (ist) return ist;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isFutureWastedAt(wastedAt: Date, now = new Date()): boolean {
  return formatIstDateInput(wastedAt) > formatIstDateInput(now);
}
