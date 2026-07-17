import { Prisma } from "@prisma/client";

import {
  itemUnitCostPaisePerBase,
  onHandValuesFifoPaiseByItem,
} from "@/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { getPrisma } from "@/lib/prisma";

export const STOCK_VALUE_CHART_LIMIT = 5;

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
  const invSettings = await ensureInventorySettings(prisma);
  const items = await prisma.inventoryItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  if (invSettings.costingMethod === "FIFO") {
    const values = await prisma.$transaction((tx) =>
      onHandValuesFifoPaiseByItem(
        tx,
        items.map((i) => i.id),
      ),
    );
    return items.map((item) => ({
      key: item.id,
      label: item.name,
      valuePaise: values.get(item.id) ?? 0,
    }));
  }

  const rows: StockValueRankRow[] = [];
  for (const item of items) {
    const unit = itemUnitCostPaisePerBase(item, invSettings.costingMethod);
    const valuePaise = decimalToPaiseInt(item.stockOnHandBase.mul(unit));
    rows.push({ key: item.id, label: item.name, valuePaise });
  }
  return rows;
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
