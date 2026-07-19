import { Prisma } from "@prisma/client";

import { D0 } from "@/lib/inventory/decimal-utils";
import {
  itemUnitCostPaisePerBase,
  peekFifoConsumptionCost,
} from "@/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { expandMenuItemConsumption } from "@/lib/inventory/recipe-resolve";

export type DishCostBreakdown = {
  menuItemId: string;
  variationId: string | null;
  costPaise: Prisma.Decimal;
  lines: {
    inventoryItemId: string;
    name: string;
    qtyBase: Prisma.Decimal;
    unitCostPaise: Prisma.Decimal;
    lineCostPaise: Prisma.Decimal;
  }[];
};

export async function computeDishCostBreakdown(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  variationId: string,
  at: Date,
): Promise<DishCostBreakdown | null> {
  const settings = await ensureInventorySettings(tx);
  const consumption = await expandMenuItemConsumption(
    tx,
    menuItemId,
    variationId,
    at,
    new Prisma.Decimal(1),
  );
  if (consumption.size === 0) return null;

  const lines: DishCostBreakdown["lines"] = [];
  let costPaise = D0;

  for (const [inventoryItemId, qtyBase] of consumption) {
    if (!qtyBase.greaterThan(0)) continue;
    const item = await tx.inventoryItem.findFirst({
      where: { id: inventoryItemId, active: true },
    });
    if (!item) continue;

    let lineCost: Prisma.Decimal;
    let unit: Prisma.Decimal;

    if (settings.costingMethod === "FIFO") {
      lineCost = await peekFifoConsumptionCost(tx, item.id, qtyBase);
      unit = qtyBase.greaterThan(0)
        ? lineCost.div(qtyBase).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
        : D0;
    } else {
      unit = itemUnitCostPaisePerBase(item, settings.costingMethod);
      lineCost = qtyBase.mul(unit).toDecimalPlaces(4);
    }

    costPaise = costPaise.add(lineCost);
    lines.push({
      inventoryItemId: item.id,
      name: item.name,
      qtyBase,
      unitCostPaise: unit,
      lineCostPaise: lineCost,
    });
  }

  if (lines.length === 0) return null;

  return {
    menuItemId,
    variationId,
    costPaise,
    lines,
  };
}

export function marginPercentPaise(
  sellingPricePaise: number,
  costPaise: Prisma.Decimal,
): number | null {
  if (!Number.isFinite(sellingPricePaise) || sellingPricePaise <= 0) return null;
  const c = costPaise.toNumber();
  const raw = ((sellingPricePaise - c) / sellingPricePaise) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 10) / 10;
}
