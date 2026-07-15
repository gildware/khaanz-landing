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
 * Next avg / last unit costs after receiving stock at a known unit cost.
 * Mirrors purchase-receipt costing.
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
