import { Prisma, type InventoryCostingMethod } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";

/**
 * Convert a purchase-unit rate (paise) into cost per 1 base unit.
 */
export function costPaisePerBaseFromPurchaseRate(
  ratePaisePerPurchaseUnit: number | Prisma.Decimal,
  baseUnitsPerPurchaseUnit: Prisma.Decimal,
): Prisma.Decimal {
  if (!baseUnitsPerPurchaseUnit.greaterThan(0)) {
    return D0;
  }
  return d(ratePaisePerPurchaseUnit)
    .div(baseUnitsPerPurchaseUnit)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Item-level unit rate used by WEIGHTED_AVERAGE / LATEST_PURCHASE
 * (and as a display fallback under FIFO).
 */
export function itemUnitCostPaisePerBase(
  item: {
    avgCostPaisePerBase: Prisma.Decimal;
    lastPurchasePaisePerBase: Prisma.Decimal;
  },
  costingMethod: InventoryCostingMethod,
): Prisma.Decimal {
  if (costingMethod === "LATEST_PURCHASE") {
    return item.lastPurchasePaisePerBase;
  }
  // WEIGHTED_AVERAGE and FIFO both keep avg as remaining-weighted for display.
  return item.avgCostPaisePerBase;
}

export function allocationCostPaise(
  qtyBase: Prisma.Decimal,
  unitCostPaisePerBase: Prisma.Decimal,
): number {
  return Math.max(
    0,
    Math.round(
      Number(
        qtyBase
          .mul(unitCostPaisePerBase)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          .toString(),
      ),
    ),
  );
}

export function sumAllocationCostPaise(
  allocations: { costPaise: number }[],
): number {
  return allocations.reduce((sum, a) => sum + Math.max(0, a.costPaise), 0);
}

/**
 * Next avg / last unit costs after receiving stock at a known unit cost.
 * Mirrors purchase-receipt costing.
 * FIFO keeps a remaining-weighted avg on the item for display; true COGS
 * uses batch layers.
 */
export function nextCostsAfterInbound(input: {
  costingMethod: InventoryCostingMethod;
  oldStockBase: Prisma.Decimal;
  oldAvgPaisePerBase: Prisma.Decimal;
  inboundQtyBase: Prisma.Decimal;
  inboundCostPaisePerBase: Prisma.Decimal;
}): {
  avgCostPaisePerBase: Prisma.Decimal;
  lastPurchasePaisePerBase: Prisma.Decimal;
} {
  const last = input.inboundCostPaisePerBase.toDecimalPlaces(
    6,
    Prisma.Decimal.ROUND_HALF_UP,
  );

  if (input.costingMethod === "LATEST_PURCHASE") {
    return { avgCostPaisePerBase: last, lastPurchasePaisePerBase: last };
  }

  const newStock = input.oldStockBase.add(input.inboundQtyBase);
  if (newStock.equals(D0)) {
    return { avgCostPaisePerBase: last, lastPurchasePaisePerBase: last };
  }

  const nextAvg = input.oldStockBase
    .mul(input.oldAvgPaisePerBase)
    .add(input.inboundQtyBase.mul(input.inboundCostPaisePerBase))
    .div(newStock)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

  return { avgCostPaisePerBase: nextAvg, lastPurchasePaisePerBase: last };
}

/**
 * Estimate COGS if we consumed `qtyBase` now under FIFO (oldest batches first).
 * Does not mutate stock.
 */
export async function peekFifoConsumptionCost(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  qtyBase: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const need0 = qtyBase.abs();
  if (!need0.greaterThan(D0)) return D0;

  const batches = await tx.inventoryBatch.findMany({
    where: {
      inventoryItemId,
      remainingQtyBase: { gt: 0 },
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: {
      remainingQtyBase: true,
      unitCostPaisePerBase: true,
    },
  });

  let need = need0;
  let cost = D0;
  for (const b of batches) {
    if (!need.greaterThan(D0)) break;
    const take = b.remainingQtyBase.greaterThan(need) ? need : b.remainingQtyBase;
    cost = cost.add(take.mul(b.unitCostPaisePerBase));
    need = need.sub(take);
  }

  // Deficit (negative stock allowed): no layer cost for the shortfall.
  return cost.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * On-hand stock value under FIFO = Σ remainingQty × batch unit cost.
 */
export async function onHandValueFifoPaise(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
): Promise<number> {
  const batches = await tx.inventoryBatch.findMany({
    where: {
      inventoryItemId,
      remainingQtyBase: { gt: 0 },
    },
    select: {
      remainingQtyBase: true,
      unitCostPaisePerBase: true,
    },
  });

  let value = D0;
  for (const b of batches) {
    value = value.add(b.remainingQtyBase.mul(b.unitCostPaisePerBase));
  }
  return Math.max(
    0,
    Math.round(
      Number(value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString()),
    ),
  );
}

export async function onHandValuesFifoPaiseByItem(
  tx: Prisma.TransactionClient,
  inventoryItemIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (inventoryItemIds.length === 0) return out;

  const batches = await tx.inventoryBatch.findMany({
    where: {
      inventoryItemId: { in: inventoryItemIds },
      remainingQtyBase: { gt: 0 },
    },
    select: {
      inventoryItemId: true,
      remainingQtyBase: true,
      unitCostPaisePerBase: true,
    },
  });

  const sums = new Map<string, Prisma.Decimal>();
  for (const b of batches) {
    const prev = sums.get(b.inventoryItemId) ?? D0;
    sums.set(
      b.inventoryItemId,
      prev.add(b.remainingQtyBase.mul(b.unitCostPaisePerBase)),
    );
  }

  for (const id of inventoryItemIds) {
    const v = sums.get(id) ?? D0;
    out.set(
      id,
      Math.max(
        0,
        Math.round(
          Number(v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString()),
        ),
      ),
    );
  }
  return out;
}
