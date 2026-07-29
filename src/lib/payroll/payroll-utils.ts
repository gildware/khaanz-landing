export function cx(...x: Array<string | false | null | undefined>): string {
  return x.filter(Boolean).join(" ");
}

/** Stored paise (or order `totalMinor`) → Indian rupees for display. */
export function formatRupees(paise: number): string {
  if (!Number.isFinite(paise)) return "—";
  const rupees = paise / 100;
  const hasPaisa = Math.round(paise) % 100 !== 0;
  return rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: hasPaisa ? 2 : 0,
  });
}

/** @deprecated Use `formatRupees` — same behavior, clearer name. */
export function formatPaise(paise: number): string {
  return formatRupees(paise);
}

export function paiseToRupeesNumber(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return paise / 100;
}

/** Recipe line costs — show tiny amounts (e.g. ₹0.003) instead of hiding them. */
export function formatRecipeCostRupees(paise: number): string {
  if (!Number.isFinite(paise)) return "—";
  const rupees = Math.max(0, paise) / 100;
  if (rupees < 0.01) {
    return rupees.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  return formatRupees(paise);
}

/** Format a value already in rupees (e.g. chart series). */
export function formatRupeesAmount(rupees: number): string {
  if (!Number.isFinite(rupees)) return "—";
  const hasPaisa = Math.abs(rupees % 1) > 0.001;
  return rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: hasPaisa ? 2 : 0,
  });
}

export function chartYAxisRupeeTick(rupees: number): string {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Recharts tooltip: value is already in rupees. */
export function chartTooltipRupeePair(
  value: number | string | undefined,
): [string, string] {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return ["—", ""];
  return [formatRupeesAmount(n), ""];
}

/** Recharts tooltip: value is still in paise. */
export function chartTooltipPaisePair(
  value: number | string | undefined,
): [string, string] {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return ["—", ""];
  return [formatRupees(n), ""];
}

/** User-entered rupee amount (string or number) → integer paise for API/storage. */
export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === "number" ? rupees : Number(rupees);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Stored paise → string for rupee input fields. */
export function paiseToRupeesInput(paise: number): string {
  if (!Number.isFinite(paise)) return "";
  const r = paise / 100;
  if (r === 0) return "";
  return Number.isInteger(r) ? String(r) : String(Number(r.toFixed(2)));
}

export function monthKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthStartEnd(monthKey: string): { start: Date; endExclusive: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) {
    throw new Error("Invalid month key (expected YYYY-MM)");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const start = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, mo + 1, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export function daysInMonthFromKey(monthKey: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) throw new Error("Invalid month key (expected YYYY-MM)");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return new Date(y, mo, 0).getDate();
}

export function dayKeyFromMonthDay(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function monthKeyFromDayKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function lastDayKeyOfMonth(monthKey: string): string {
  const days = daysInMonthFromKey(monthKey);
  return dayKeyFromMonthDay(monthKey, days);
}

export function fullMonthPeriod(monthKey: string): {
  monthKey: string;
  startDayKey: string;
  endDayKey: string;
} {
  return {
    monthKey,
    startDayKey: dayKeyFromMonthDay(monthKey, 1),
    endDayKey: lastDayKeyOfMonth(monthKey),
  };
}

export function dayNumberFromKey(dayKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error("Invalid day key (expected YYYY-MM-DD)");
  return Number(m[3]);
}

export function formatDayKeyLabel(startDayKey: string, endDayKey: string): string {
  if (startDayKey === endDayKey) {
    const d = new Date(
      Number(startDayKey.slice(0, 4)),
      Number(startDayKey.slice(5, 7)) - 1,
      Number(startDayKey.slice(8, 10)),
    );
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  const start = new Date(
    Number(startDayKey.slice(0, 4)),
    Number(startDayKey.slice(5, 7)) - 1,
    Number(startDayKey.slice(8, 10)),
  );
  const end = new Date(
    Number(endDayKey.slice(0, 4)),
    Number(endDayKey.slice(5, 7)) - 1,
    Number(endDayKey.slice(8, 10)),
  );
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthLabel = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return `${start.getDate()}–${end.getDate()} ${monthLabel}`;
  }
  const startLabel = start.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

export function dayKeysInclusive(startDayKey: string, endDayKey: string): string[] {
  if (endDayKey < startDayKey) return [];
  const keys: string[] = [];
  const start = new Date(
    Number(startDayKey.slice(0, 4)),
    Number(startDayKey.slice(5, 7)) - 1,
    Number(startDayKey.slice(8, 10)),
  );
  const end = new Date(
    Number(endDayKey.slice(0, 4)),
    Number(endDayKey.slice(5, 7)) - 1,
    Number(endDayKey.slice(8, 10)),
  );
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    keys.push(`${y}-${m}-${day}`);
  }
  return keys;
}

export function dayStartEndExclusive(dayKey: string): { start: Date; endExclusive: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error("Invalid day key (expected YYYY-MM-DD)");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const start = new Date(Date.UTC(y, mo, day, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, mo, day + 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export function periodStartEndExclusive(
  startDayKey: string,
  endDayKey: string,
): { start: Date; endExclusive: Date } {
  const { start } = dayStartEndExclusive(startDayKey);
  const { endExclusive } = dayStartEndExclusive(endDayKey);
  return { start, endExclusive };
}

export function dayKeyUTC(d: Date): string {
  // Store day keys as YYYY-MM-DD (local policy), but server runs in UTC.
  // We accept that "dayKey" is a stable string input by the UI.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

