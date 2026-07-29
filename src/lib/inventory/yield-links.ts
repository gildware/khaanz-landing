import type { Prisma } from "@prisma/client";

import type {
  MenuConsumptionCache,
  YieldLinkMap,
} from "@/lib/inventory/consumption-cache";
import { loadYieldLinkMap } from "@/lib/inventory/consumption-cache";
import { D0 } from "@/lib/inventory/decimal-utils";

export type YieldLinkSerialized = {
  sourceItemId: string;
  sourceItemName: string;
  yieldPercent: number;
};

export function sourceQtyForCookQty(
  cookQty: Prisma.Decimal,
  yieldPercent: number,
): Prisma.Decimal {
  if (yieldPercent <= 0) return cookQty;
  return cookQty.mul(100).div(yieldPercent);
}

export function serializeYieldLink(row: {
  yieldSourceItemId: string | null;
  yieldPercent: { toString(): string } | number | null;
  yieldSourceItem?: { id: string; name: string } | null;
}): YieldLinkSerialized | null {
  const sourceId = row.yieldSourceItemId;
  if (!sourceId) return null;
  const pctRaw = row.yieldPercent;
  if (pctRaw == null) return null;
  const pct = typeof pctRaw === "number" ? pctRaw : Number(pctRaw.toString());
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  return {
    sourceItemId: sourceId,
    sourceItemName: row.yieldSourceItem?.name ?? "",
    yieldPercent: pct,
  };
}

/**
 * Rewrite recipe consumption so an item produced from another one deducts the
 * source instead: 800 g boneless at 80% yield consumes 1000 g of frozen stock.
 * Items without a yield link are passed through unchanged.
 */
export async function applyYieldLinksToConsumption(
  tx: Prisma.TransactionClient,
  consumption: Map<string, Prisma.Decimal>,
  cache?: MenuConsumptionCache,
): Promise<Map<string, Prisma.Decimal>> {
  if (consumption.size === 0) return consumption;

  const links = cache
    ? await cache.yieldLinks(tx)
    : await loadYieldLinkMap(tx);
  return applyYieldLinkMap(consumption, links);
}

export function applyYieldLinkMap(
  consumption: Map<string, Prisma.Decimal>,
  links: YieldLinkMap,
): Map<string, Prisma.Decimal> {
  if (links.size === 0) return consumption;

  const out = new Map<string, Prisma.Decimal>();
  for (const [id, qty] of consumption) {
    if (!qty || qty.equals(D0)) continue;
    const link = links.get(id);
    if (!link) {
      out.set(id, (out.get(id) ?? D0).add(qty));
      continue;
    }
    const sourceQty = sourceQtyForCookQty(qty, link.yieldPercent);
    out.set(link.sourceId, (out.get(link.sourceId) ?? D0).add(sourceQty));
  }
  return out;
}

/** Validate yield link fields for create/update. */
export function parseYieldLinkInput(body: Record<string, unknown>):
  | { clear: true }
  | { sourceItemId: string; yieldPercent: number }
  | { error: string }
  | { skip: true } {
  if (!("yieldSourceItemId" in body) && !("yieldPercent" in body)) {
    return { skip: true };
  }

  const rawSource = body.yieldSourceItemId;
  const clearSource =
    rawSource === null ||
    rawSource === "" ||
    (typeof rawSource === "string" && rawSource.trim() === "");

  if (clearSource) {
    return { clear: true };
  }

  if (typeof rawSource !== "string") {
    return { error: "yieldSourceItemId must be a string or null" };
  }
  const sourceItemId = rawSource.trim();

  const pctRaw = body.yieldPercent;
  const pct =
    typeof pctRaw === "number"
      ? pctRaw
      : typeof pctRaw === "string"
        ? Number(pctRaw.trim())
        : NaN;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { error: "yieldPercent must be between 1 and 100" };
  }

  return { sourceItemId, yieldPercent: pct };
}
