import type { Prisma } from "@prisma/client";

type StockWorthRow = {
  qtyBase: Prisma.Decimal | null;
  item: { avgCostPaisePerBase: Prisma.Decimal } | null;
};

type OrderWorthRow = {
  qtyBase: Prisma.Decimal | null;
  variation: { price: number } | null;
  order: { totalMinor: number } | null;
};

export function computeStockWorthPaise(rows: StockWorthRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (!row.qtyBase || !row.item) continue;
    const qty = Number(row.qtyBase.toString());
    const costPerBase = Number(row.item.avgCostPaisePerBase.toString());
    if (!Number.isFinite(qty) || !Number.isFinite(costPerBase)) continue;
    total += Math.round(qty * costPerBase);
  }
  return total;
}

export function computeOrderWorthPaise(rows: OrderWorthRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.variation && row.qtyBase) {
      const qty = Number(row.qtyBase.toString());
      const unitPaise = Math.round(row.variation.price * 100);
      if (Number.isFinite(qty) && Number.isFinite(unitPaise)) {
        total += Math.round(qty * unitPaise);
      }
      continue;
    }
    if (row.order?.totalMinor) {
      total += row.order.totalMinor;
    }
  }
  return total;
}
