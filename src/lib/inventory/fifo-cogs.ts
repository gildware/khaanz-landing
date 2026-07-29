import { Prisma } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";

type ConsumptionCostClient = {
  inventoryBatchConsumption: Prisma.TransactionClient["inventoryBatchConsumption"];
  inventoryItem: Prisma.TransactionClient["inventoryItem"];
};

type ConsumptionCostRow = {
  costPaise: number;
  qtyBase: Prisma.Decimal;
  inventoryItemId: string;
};

async function sumConsumptionRows(
  tx: ConsumptionCostClient,
  rows: ConsumptionCostRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const needFallbackIds = new Set<string>();
  for (const r of rows) {
    if (r.costPaise <= 0) needFallbackIds.add(r.inventoryItemId);
  }

  const avgById = new Map<string, Prisma.Decimal>();
  if (needFallbackIds.size > 0) {
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: [...needFallbackIds] } },
      select: { id: true, avgCostPaisePerBase: true },
    });
    for (const i of items) avgById.set(i.id, i.avgCostPaisePerBase);
  }

  let total = 0;
  for (const r of rows) {
    if (r.costPaise > 0) {
      total += r.costPaise;
      continue;
    }
    const rate = avgById.get(r.inventoryItemId) ?? D0;
    total += Math.round(Number(r.qtyBase.mul(rate).toString()));
  }
  return total;
}

/**
 * Sum recipe COGS for orders from batch consumption snapshots.
 * Rows with costPaise=0 (pre-FIFO data) fall back to qty × item avg cost.
 */
export async function sumOrderConsumptionCostPaise(
  tx: ConsumptionCostClient,
  orderIds: string[],
): Promise<number> {
  if (orderIds.length === 0) return 0;

  const rows = await tx.inventoryBatchConsumption.findMany({
    where: {
      referenceType: "order",
      orderId: { in: orderIds },
    },
    select: {
      costPaise: true,
      qtyBase: true,
      inventoryItemId: true,
    },
  });

  return sumConsumptionRows(tx, rows);
}

/**
 * Same as {@link sumOrderConsumptionCostPaise} but by consumption time range
 * (avoids loading all month order ids first).
 */
export async function sumOrderConsumptionCostPaiseInRange(
  tx: ConsumptionCostClient,
  from: Date,
  toExclusive: Date,
): Promise<number> {
  const rows = await tx.inventoryBatchConsumption.findMany({
    where: {
      referenceType: "order",
      occurredAt: { gte: from, lt: toExclusive },
    },
    select: {
      costPaise: true,
      qtyBase: true,
      inventoryItemId: true,
    },
  });

  return sumConsumptionRows(tx, rows);
}

/**
 * Per-day recipe COGS from order consumptions (IST day key from occurredAt).
 */
export async function sumOrderConsumptionCostPaiseByDay(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  dayKeyFn: (at: Date) => string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;

  const rows = await tx.inventoryBatchConsumption.findMany({
    where: {
      referenceType: "order",
      orderId: { in: orderIds },
    },
    select: {
      costPaise: true,
      qtyBase: true,
      inventoryItemId: true,
      occurredAt: true,
    },
  });

  const needFallbackIds = new Set<string>();
  for (const r of rows) {
    if (r.costPaise <= 0) needFallbackIds.add(r.inventoryItemId);
  }
  const avgById = new Map<string, Prisma.Decimal>();
  if (needFallbackIds.size > 0) {
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: [...needFallbackIds] } },
      select: { id: true, avgCostPaisePerBase: true },
    });
    for (const i of items) avgById.set(i.id, i.avgCostPaisePerBase);
  }

  for (const r of rows) {
    const day = dayKeyFn(r.occurredAt);
    let cost = r.costPaise;
    if (cost <= 0) {
      const rate = avgById.get(r.inventoryItemId) ?? D0;
      cost = Math.round(Number(r.qtyBase.mul(rate).toString()));
    }
    out.set(day, (out.get(day) ?? 0) + cost);
  }
  return out;
}

/**
 * Map wastage entry id → FIFO COGS from consumptions (with avg fallback).
 */
export async function wastageCostPaiseByEntryId(
  tx: Prisma.TransactionClient,
  wastageEntryIds: string[],
  avgByItemId: Map<string, Prisma.Decimal>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (wastageEntryIds.length === 0) return out;

  const rows = await tx.inventoryBatchConsumption.findMany({
    where: {
      referenceType: "wastage",
      referenceId: { in: wastageEntryIds },
    },
    select: {
      referenceId: true,
      costPaise: true,
      qtyBase: true,
      inventoryItemId: true,
    },
  });

  for (const r of rows) {
    let cost = r.costPaise;
    if (cost <= 0) {
      const rate = avgByItemId.get(r.inventoryItemId) ?? D0;
      cost = Math.round(Number(d(r.qtyBase).mul(rate).toString()));
    }
    out.set(r.referenceId, (out.get(r.referenceId) ?? 0) + cost);
  }
  return out;
}
