import { Prisma } from "@prisma/client";

import {
  itemUnitCostPaisePerBase,
  onHandValuesFifoPaiseByItem,
} from "@/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { getPrisma } from "@/lib/prisma";

export const STOCK_VALUE_CHART_LIMIT = 10;

export type StockValueRankRow = {
  key: string;
  label: string;
  valuePaise: number;
};

export function decimalToPaiseInt(v: Prisma.Decimal): number {
  return Math.round(Number(v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString()));
}

export async function loadStockValueRankRows(): Promise<StockValueRankRow[]> {
  const prisma = getPrisma();
  const [invSettings, items] = await Promise.all([
    ensureInventorySettings(prisma),
    prisma.inventoryItem.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        stockOnHandBase: true,
        avgCostPaisePerBase: true,
        lastPurchasePaisePerBase: true,
        yieldSourceItemId: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Cook items with a yield link don't hold stock — value is on the source.
  const stockItems = items.filter((i) => !i.yieldSourceItemId);

  if (invSettings.costingMethod === "FIFO") {
    const values = await onHandValuesFifoPaiseByItem(
      prisma,
      stockItems.map((i) => i.id),
    );
    return stockItems.map((item) => ({
      key: item.id,
      label: item.name,
      valuePaise: values.get(item.id) ?? 0,
    }));
  }

  return stockItems.map((item) => {
    const unit = itemUnitCostPaisePerBase(item, invSettings.costingMethod);
    return {
      key: item.id,
      label: item.name,
      valuePaise: decimalToPaiseInt(item.stockOnHandBase.mul(unit)),
    };
  });
}

export function splitStockValueRanks(
  rows: StockValueRankRow[],
  limit = STOCK_VALUE_CHART_LIMIT,
): { topByValue: StockValueRankRow[]; lowestByValue: StockValueRankRow[] } {
  const sorted = [...rows].sort(
    (a, b) => b.valuePaise - a.valuePaise || a.label.localeCompare(b.label),
  );
  const bottom = [...sorted].reverse();
  return {
    topByValue: sorted.filter((r) => r.valuePaise > 0).slice(0, limit),
    lowestByValue: bottom.slice(0, limit),
  };
}
