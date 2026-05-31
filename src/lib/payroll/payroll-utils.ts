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

export function dayKeyUTC(d: Date): string {
  // Store day keys as YYYY-MM-DD (local policy), but server runs in UTC.
  // We accept that "dayKey" is a stable string input by the UI.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

