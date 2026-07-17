import { Prisma } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { allocationCostPaise } from "@/lib/inventory/inventory-costing";

export async function ensureBackfillBatchForLegacyStock(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
): Promise<void> {
  const [item, batchCount] = await Promise.all([
    tx.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: {
        id: true,
        stockOnHandBase: true,
        createdAt: true,
        avgCostPaisePerBase: true,
      },
    }),
    tx.inventoryBatch.count({ where: { inventoryItemId } }),
  ]);

  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (batchCount > 0) return;
  if (!item.stockOnHandBase.greaterThan(D0)) return;

  // One-time backfill: treat current stock as opening batch so FIFO + expiry tracking works.
  await tx.inventoryBatch.create({
    data: {
      inventoryItemId,
      receivedAt: item.createdAt,
      sourceType: "OPENING_STOCK",
      sourceId: "legacy_backfill",
      expiryDate: null,
      lotCode: "LEGACY",
      qtyReceivedBase: item.stockOnHandBase,
      remainingQtyBase: item.stockOnHandBase,
      unitCostPaisePerBase: item.avgCostPaisePerBase,
    },
  });
}

export async function createInboundBatch(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    receivedAt: Date;
    sourceType: "OPENING_STOCK" | "PURCHASE_LINE" | "ADJUSTMENT_UP" | "AUDIT_SURPLUS";
    sourceId: string;
    qtyBase: Prisma.Decimal;
    expiryDate?: Date | null;
    lotCode?: string;
    purchaseLineId?: string | null;
    /** Paise per 1 base unit for this layer. */
    unitCostPaisePerBase?: Prisma.Decimal | number | null;
  },
): Promise<{ batchId: string }> {
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("BATCH_QTY_ZERO");

  const unitCost = d(input.unitCostPaisePerBase ?? 0).toDecimalPlaces(
    6,
    Prisma.Decimal.ROUND_HALF_UP,
  );

  const b = await tx.inventoryBatch.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      receivedAt: input.receivedAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId.slice(0, 64),
      expiryDate: input.expiryDate ?? null,
      lotCode: (input.lotCode ?? "").trim().slice(0, 64),
      qtyReceivedBase: qty,
      remainingQtyBase: qty,
      unitCostPaisePerBase: unitCost,
      purchaseLineId: input.purchaseLineId ?? null,
    },
    select: { id: true },
  });
  return { batchId: b.id };
}

export type ConsumeAllocation = {
  batchId: string;
  qtyBase: Prisma.Decimal;
  unitCostPaisePerBase: Prisma.Decimal;
  costPaise: number;
};

export async function consumeFromSpecificBatch(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    occurredAt: Date;
    referenceType: string;
    referenceId: string;
    orderId?: string | null;
    createdByUserId?: string | null;
    allowNegative: boolean;
  },
): Promise<ConsumeAllocation | null> {
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) return null;

  const b = await tx.inventoryBatch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      inventoryItemId: true,
      remainingQtyBase: true,
      unitCostPaisePerBase: true,
    },
  });
  if (!b || b.inventoryItemId !== input.inventoryItemId) {
    throw new Error("BATCH_NOT_FOUND");
  }

  if (!input.allowNegative && b.remainingQtyBase.lessThan(qty)) {
    throw new Error("BATCH_INSUFFICIENT");
  }

  const costPaise = allocationCostPaise(qty, b.unitCostPaisePerBase);

  await tx.inventoryBatch.update({
    where: { id: b.id },
    data: { remainingQtyBase: b.remainingQtyBase.sub(qty) },
  });

  await tx.inventoryBatchConsumption.create({
    data: {
      batchId: b.id,
      inventoryItemId: input.inventoryItemId,
      orderId: input.orderId ?? null,
      referenceType: (input.referenceType ?? "").slice(0, 32),
      referenceId: (input.referenceId ?? "").slice(0, 64),
      occurredAt: input.occurredAt,
      qtyBase: qty,
      costPaise,
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  return {
    batchId: b.id,
    qtyBase: qty,
    unitCostPaisePerBase: b.unitCostPaisePerBase,
    costPaise,
  };
}

export async function consumeFromBatchesFifo(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    occurredAt: Date;
    referenceType: string;
    referenceId: string;
    orderId?: string | null;
    createdByUserId?: string | null;
    /// When true and stock is insufficient, we record the deficit into a special negative batch.
    allowNegative: boolean;
  },
): Promise<ConsumeAllocation[]> {
  const need0 = input.qtyBase.abs();
  if (need0.equals(D0)) return [];

  await ensureBackfillBatchForLegacyStock(tx, input.inventoryItemId);

  let need = need0;
  const allocations: ConsumeAllocation[] = [];

  while (need.greaterThan(D0)) {
    const locked = (await tx.$queryRaw<
      {
        id: string;
        remaining_qty_base: string;
        unit_cost_paise_per_base: string;
      }[]
    >`
      SELECT id, remaining_qty_base, unit_cost_paise_per_base
      FROM inventory_batches
      WHERE inventory_item_id = ${input.inventoryItemId}
        AND remaining_qty_base > 0
      ORDER BY received_at ASC, id ASC
      LIMIT 50
      FOR UPDATE
    `) as {
      id: string;
      remaining_qty_base: string;
      unit_cost_paise_per_base: string;
    }[];

    if (locked.length === 0) break;

    for (const row of locked) {
      if (!need.greaterThan(D0)) break;
      const remaining = d(row.remaining_qty_base);
      if (!remaining.greaterThan(D0)) continue;
      const take = remaining.greaterThan(need) ? need : remaining;
      const unitCost = d(row.unit_cost_paise_per_base);
      const costPaise = allocationCostPaise(take, unitCost);

      await tx.inventoryBatch.update({
        where: { id: row.id },
        data: { remainingQtyBase: remaining.sub(take) },
        select: { id: true },
      });

      await tx.inventoryBatchConsumption.create({
        data: {
          batchId: row.id,
          inventoryItemId: input.inventoryItemId,
          orderId: input.orderId ?? null,
          referenceType: (input.referenceType ?? "").slice(0, 32),
          referenceId: (input.referenceId ?? "").slice(0, 64),
          occurredAt: input.occurredAt,
          qtyBase: take,
          costPaise,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      allocations.push({
        batchId: row.id,
        qtyBase: take,
        unitCostPaisePerBase: unitCost,
        costPaise,
      });
      need = need.sub(take);
    }
  }

  if (need.greaterThan(D0)) {
    if (!input.allowNegative) throw new Error("BATCH_INSUFFICIENT");

    const existingNeg = await tx.inventoryBatch.findFirst({
      where: {
        inventoryItemId: input.inventoryItemId,
        sourceType: "OPENING_STOCK",
        sourceId: "negative_deficit",
        lotCode: "NEGATIVE",
        qtyReceivedBase: D0,
      },
      orderBy: { receivedAt: "desc" },
      select: { id: true, remainingQtyBase: true, unitCostPaisePerBase: true },
    });

    const negative = existingNeg
      ? await tx.inventoryBatch.update({
          where: { id: existingNeg.id },
          data: { remainingQtyBase: existingNeg.remainingQtyBase.sub(need) },
          select: { id: true, unitCostPaisePerBase: true },
        })
      : await tx.inventoryBatch.create({
          data: {
            inventoryItemId: input.inventoryItemId,
            receivedAt: input.occurredAt,
            sourceType: "OPENING_STOCK",
            sourceId: "negative_deficit",
            expiryDate: null,
            lotCode: "NEGATIVE",
            qtyReceivedBase: D0,
            remainingQtyBase: d(0).sub(need),
            unitCostPaisePerBase: D0,
            purchaseLineId: null,
          },
          select: { id: true, unitCostPaisePerBase: true },
        });

    const unitCost = negative.unitCostPaisePerBase;
    const costPaise = allocationCostPaise(need, unitCost);

    await tx.inventoryBatchConsumption.create({
      data: {
        batchId: negative.id,
        inventoryItemId: input.inventoryItemId,
        orderId: input.orderId ?? null,
        referenceType: (input.referenceType ?? "").slice(0, 32),
        referenceId: (input.referenceId ?? "").slice(0, 64),
        occurredAt: input.occurredAt,
        qtyBase: need,
        costPaise,
        createdByUserId: input.createdByUserId ?? null,
      },
    });

    allocations.push({
      batchId: negative.id,
      qtyBase: need,
      unitCostPaisePerBase: unitCost,
      costPaise,
    });
  }

  return allocations;
}

export async function restoreToBatches(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    occurredAt: Date;
    createdByUserId?: string | null;
  },
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await tx.inventoryBatchConsumption.findMany({
    where: { orderId: input.orderId, referenceType: "order" },
    orderBy: { occurredAt: "asc" },
  });

  const restoredByItem = new Map<string, Prisma.Decimal>();
  const restoreByBatch = new Map<string, Prisma.Decimal>();

  for (const r of rows) {
    const prevB = restoreByBatch.get(r.batchId) ?? D0;
    restoreByBatch.set(r.batchId, prevB.add(r.qtyBase));
    const prevI = restoredByItem.get(r.inventoryItemId) ?? D0;
    restoredByItem.set(r.inventoryItemId, prevI.add(r.qtyBase));
  }

  for (const [batchId, qty] of restoreByBatch) {
    const b = await tx.inventoryBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { remainingQtyBase: true },
    });
    await tx.inventoryBatch.update({
      where: { id: batchId },
      data: { remainingQtyBase: b.remainingQtyBase.add(qty) },
    });
  }

  return restoredByItem;
}
