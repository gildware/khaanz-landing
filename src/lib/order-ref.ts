import type { Prisma } from "@prisma/client";

/** YYYY-MM-DD in Asia/Kolkata (for counter bucket). */
export function istDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

/** DDMMYY in Asia/Kolkata, e.g. 200426 for 20 Apr 2026. */
export function formatDdMMyyIST(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "00";
  return `${day.padStart(2, "0")}${month.padStart(2, "0")}${year.padStart(2, "0")}`;
}

/** e.g. KH-200426001 */
export function buildOrderDisplayRef(ddMMyy: string, seq: number): string {
  return `KH-${ddMMyy}${String(seq).padStart(3, "0")}`;
}

/**
 * Atomically increments the IST-day counter and returns the new sequence (1-based).
 */
export async function allocateNextOrderSequence(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<number> {
  const dayKey = istDateKey(now);
  const rows = await tx.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO "order_counter_day" ("day_key", "last_seq")
    VALUES (${dayKey}, 1)
    ON CONFLICT ("day_key") DO UPDATE SET
      "last_seq" = "order_counter_day"."last_seq" + 1
    RETURNING "last_seq"
  `;
  const n = rows[0]?.last_seq;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error("ORDER_SEQUENCE_FAILED");
  }
  return n;
}
