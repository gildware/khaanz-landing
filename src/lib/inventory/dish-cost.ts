import type { Prisma } from "@prisma/client";

import { D0 } from "@/lib/inventory/decimal-utils";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { resolveRecipeVersion } from "@/lib/inventory/recipe-resolve";

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
  const recipe = await resolveRecipeVersion(tx, menuItemId, variationId, at);
  if (!recipe) return null;

  const lines: DishCostBreakdown["lines"] = [];
  let costPaise = D0;

  for (const ing of recipe.ingredients) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: ing.inventoryItemId, active: true },
    });
    if (!item) continue;
    const unit =
      settings.costingMethod === "LATEST_PURCHASE"
        ? item.lastPurchasePaisePerBase
        : item.avgCostPaisePerBase;
    const lineCost = ing.qtyBase.mul(unit).toDecimalPlaces(4);
    costPaise = costPaise.add(lineCost);
    lines.push({
      inventoryItemId: item.id,
      name: item.name,
      qtyBase: ing.qtyBase,
      unitCostPaise: unit,
      lineCostPaise: lineCost,
    });
  }

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
