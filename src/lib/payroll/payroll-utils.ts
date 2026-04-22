export function cx(...x: Array<string | false | null | undefined>): string {
  return x.filter(Boolean).join(" ");
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", { style: "currency", currency: "INR" });
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

