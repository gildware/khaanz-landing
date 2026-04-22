import type { Prisma } from "@prisma/client";

import { formatDdMMyyIST, istDateKey } from "@/lib/order-ref";

/** e.g. INV-200426001 */
export function buildPurchaseBatchRef(ddMMyy: string, seq: number): string {
  return `INV-${ddMMyy}${String(seq).padStart(3, "0")}`;
}

export async function allocateNextPurchaseSequence(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<number> {
  const dayKey = istDateKey(now);
  const rows = await tx.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO "purchase_counter_day" ("day_key", "last_seq")
    VALUES (${dayKey}, 1)
    ON CONFLICT ("day_key") DO UPDATE SET
      "last_seq" = "purchase_counter_day"."last_seq" + 1
    RETURNING "last_seq"
  `;
  const n = rows[0]?.last_seq;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error("PURCHASE_SEQUENCE_FAILED");
  }
  return n;
}

export function nextPurchaseBatchRef(now: Date, seq: number): string {
  return buildPurchaseBatchRef(formatDdMMyyIST(now), seq);
}
