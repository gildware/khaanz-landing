import type { AdjustmentReason, Prisma, WastageType } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { consumeFromBatchesFifo, createInboundBatch } from "@/lib/inventory/batch-ops";
import {
  allocationCostPaise,
  costPaisePerBaseFromPurchaseRate,
  itemUnitCostPaisePerBase,
  nextCostsAfterInbound,
  sumAllocationCostPaise,
} from "@/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";

export async function recordOpeningOrAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyDeltaBase: Prisma.Decimal;
    direction: "up" | "down";
    reason: AdjustmentReason;
    note?: string;
    occurredAt: Date;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
    referenceType?: string;
    referenceId?: string;
  },
): Promise<void> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");

  const signed =
    input.direction === "up"
      ? input.qtyDeltaBase.abs()
      : d(0).sub(input.qtyDeltaBase.abs());

  if (signed.equals(D0)) return;

  const type =
    input.direction === "up" ? "ADJUSTMENT_UP" : "ADJUSTMENT_DOWN";

  const adj = await tx.stockAdjustment.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.occurredAt,
      direction: input.direction === "up" ? "IN" : "OUT",
      qtyBase: input.qtyDeltaBase.abs(),
      reason: input.reason,
      note: (input.note ?? "").slice(0, 2000),
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true },
  });

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(signed) },
  });

  if (input.direction === "down") {
    await consumeFromBatchesFifo(tx, {
      inventoryItemId: item.id,
      qtyBase: input.qtyDeltaBase.abs(),
      occurredAt: input.occurredAt,
      referenceType: "stock_adjustment",
      referenceId: adj.id,
      orderId: null,
      createdByUserId: input.createdByUserId ?? null,
      allowNegative: input.allowNegativeStock,
    });
  }

  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.occurredAt,
      type,
      qtyDeltaBase: signed,
      referenceType: (input.referenceType ?? "manual_adjustment").slice(0, 32),
      referenceId: (input.referenceId ?? "").slice(0, 64),
      note: `${input.reason}:${(input.note ?? "").slice(0, 500)}`.slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  if (input.direction === "up") {
    await createInboundBatch(tx, {
      inventoryItemId: item.id,
      receivedAt: input.occurredAt,
      sourceType: "ADJUSTMENT_UP",
      sourceId: adj.id,
      qtyBase: input.qtyDeltaBase.abs(),
      expiryDate: null,
      lotCode: "ADJUSTMENT",
      purchaseLineId: null,
      unitCostPaisePerBase: item.avgCostPaisePerBase,
    });
  }
}

export async function recordOpeningStock(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    occurredAt: Date;
    note?: string;
    createdByUserId?: string | null;
    /** Optional purchase-unit rate in paise; when set, updates item unit cost. */
    ratePaisePerPurchaseUnit?: number | null;
  },
): Promise<void> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) return;

  const rate =
    input.ratePaisePerPurchaseUnit != null &&
    Number.isFinite(input.ratePaisePerPurchaseUnit) &&
    input.ratePaisePerPurchaseUnit >= 0
      ? Math.floor(input.ratePaisePerPurchaseUnit)
      : null;

  const stockData: Prisma.InventoryItemUpdateInput = {
    stockOnHandBase: item.stockOnHandBase.add(qty),
  };

  let batchUnitCost = item.avgCostPaisePerBase;
  if (rate != null) {
    const settings = await ensureInventorySettings(tx);
    const costPerBase = costPaisePerBaseFromPurchaseRate(
      rate,
      item.baseUnitsPerPurchaseUnit,
    );
    batchUnitCost = costPerBase;
    const next = nextCostsAfterInbound({
      costingMethod: settings.costingMethod,
      oldStockBase: item.stockOnHandBase,
      oldAvgPaisePerBase: item.avgCostPaisePerBase,
      inboundQtyBase: qty,
      inboundCostPaisePerBase: costPerBase,
    });
    stockData.avgCostPaisePerBase = next.avgCostPaisePerBase;
    stockData.lastPurchasePaisePerBase = next.lastPurchasePaisePerBase;
  }

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: stockData,
  });

  await tx.inventoryMovement.create({
    // Create movement first so we can reference it in the batch.
    data: {
      inventoryItemId: item.id,
      occurredAt: input.occurredAt,
      type: "OPENING_STOCK",
      qtyDeltaBase: qty,
      referenceType: "opening",
      referenceId: item.id,
      note: (input.note ?? "Opening stock").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await createInboundBatch(tx, {
    inventoryItemId: item.id,
    receivedAt: input.occurredAt,
    sourceType: "OPENING_STOCK",
    sourceId: item.id,
    qtyBase: qty,
    expiryDate: null,
    lotCode: "OPENING",
    purchaseLineId: null,
    unitCostPaisePerBase: batchUnitCost,
  });
}

export async function recordWastage(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    wastedAt: Date;
    wastageType: WastageType;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
    menuWastageEntryId?: string | null;
  },
): Promise<{ id: string }> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("WASTAGE_QTY_ZERO");

  const delta = d(0).sub(qty);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(delta) },
  });

  const row = await tx.wastageEntry.create({
    data: {
      inventoryItemId: item.id,
      menuWastageEntryId: input.menuWastageEntryId ?? null,
      wastedAt: input.wastedAt,
      qtyBase: qty,
      wastageType: input.wastageType,
      note: (input.note ?? "").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await consumeFromBatchesFifo(tx, {
    inventoryItemId: item.id,
    qtyBase: qty,
    occurredAt: input.wastedAt,
    referenceType: "wastage",
    referenceId: row.id,
    orderId: null,
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegativeStock,
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.wastedAt,
      type: "WASTAGE",
      qtyDeltaBase: delta,
      referenceType: "wastage",
      referenceId: row.id,
      note: input.wastageType,
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  return { id: row.id };
}

/**
 * Reverses FIFO consumptions + stock for one ingredient wastage row,
 * and removes its WASTAGE movement. Does not delete the WastageEntry itself.
 */
export async function reverseIngredientWastageStock(
  tx: Prisma.TransactionClient,
  wastageEntryId: string,
): Promise<void> {
  const entry = await tx.wastageEntry.findUnique({
    where: { id: wastageEntryId },
    select: { id: true, inventoryItemId: true, qtyBase: true },
  });
  if (!entry) throw new Error("WASTAGE_NOT_FOUND");

  const rows = await tx.inventoryBatchConsumption.findMany({
    where: { referenceType: "wastage", referenceId: wastageEntryId },
  });

  const restoreByBatch = new Map<string, Prisma.Decimal>();
  const restoreByItem = new Map<string, Prisma.Decimal>();

  if (rows.length > 0) {
    for (const r of rows) {
      restoreByBatch.set(
        r.batchId,
        (restoreByBatch.get(r.batchId) ?? D0).add(r.qtyBase),
      );
      restoreByItem.set(
        r.inventoryItemId,
        (restoreByItem.get(r.inventoryItemId) ?? D0).add(r.qtyBase),
      );
    }
  } else {
    // Fallback if consumption rows are missing — restore the recorded qty.
    restoreByItem.set(entry.inventoryItemId, entry.qtyBase);
  }

  for (const [batchId, qty] of restoreByBatch) {
    const b = await tx.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { remainingQtyBase: true },
    });
    if (!b) continue;
    await tx.inventoryBatch.update({
      where: { id: batchId },
      data: { remainingQtyBase: b.remainingQtyBase.add(qty) },
    });
  }

  const itemIds = [...restoreByItem.keys()];
  if (itemIds.length > 0) {
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: itemIds } },
    });
    const byId = new Map(items.map((r) => [r.id, r]));
    for (const [inventoryItemId, qty] of restoreByItem) {
      const row = byId.get(inventoryItemId);
      if (!row || qty.equals(D0)) continue;
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { stockOnHandBase: row.stockOnHandBase.add(qty) },
      });
    }
  }

  await tx.inventoryBatchConsumption.deleteMany({
    where: { referenceType: "wastage", referenceId: wastageEntryId },
  });
  await tx.inventoryMovement.deleteMany({
    where: { referenceType: "wastage", referenceId: wastageEntryId },
  });
}

async function applyIngredientWastageDeduction(
  tx: Prisma.TransactionClient,
  input: {
    wastageEntryId: string;
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    wastedAt: Date;
    wastageType: WastageType;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
  },
): Promise<void> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("WASTAGE_QTY_ZERO");

  const delta = d(0).sub(qty);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(delta) },
  });

  await consumeFromBatchesFifo(tx, {
    inventoryItemId: item.id,
    qtyBase: qty,
    occurredAt: input.wastedAt,
    referenceType: "wastage",
    referenceId: input.wastageEntryId,
    orderId: null,
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegativeStock,
  });

  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.wastedAt,
      type: "WASTAGE",
      qtyDeltaBase: delta,
      referenceType: "wastage",
      referenceId: input.wastageEntryId,
      note: input.wastageType,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function deleteIngredientWastage(
  tx: Prisma.TransactionClient,
  wastageEntryId: string,
): Promise<void> {
  const entry = await tx.wastageEntry.findUnique({
    where: { id: wastageEntryId },
    select: { id: true, menuWastageEntryId: true },
  });
  if (!entry) throw new Error("WASTAGE_NOT_FOUND");
  if (entry.menuWastageEntryId) {
    throw new Error("DISH_WASTAGE_CHILD");
  }
  await reverseIngredientWastageStock(tx, wastageEntryId);
  await tx.wastageEntry.delete({ where: { id: wastageEntryId } });
}

export async function updateIngredientWastage(
  tx: Prisma.TransactionClient,
  wastageEntryId: string,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    wastedAt: Date;
    wastageType: WastageType;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
  },
): Promise<{ id: string }> {
  const entry = await tx.wastageEntry.findUnique({
    where: { id: wastageEntryId },
    select: { id: true, menuWastageEntryId: true },
  });
  if (!entry) throw new Error("WASTAGE_NOT_FOUND");
  if (entry.menuWastageEntryId) {
    throw new Error("DISH_WASTAGE_CHILD");
  }

  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("WASTAGE_QTY_ZERO");

  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
    select: { id: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");

  await reverseIngredientWastageStock(tx, wastageEntryId);

  await tx.wastageEntry.update({
    where: { id: wastageEntryId },
    data: {
      inventoryItemId: item.id,
      qtyBase: qty,
      wastedAt: input.wastedAt,
      wastageType: input.wastageType,
      note: (input.note ?? "").slice(0, 500),
    },
  });

  await applyIngredientWastageDeduction(tx, {
    wastageEntryId,
    inventoryItemId: item.id,
    qtyBase: qty,
    wastedAt: input.wastedAt,
    wastageType: input.wastageType,
    createdByUserId: input.createdByUserId ?? null,
    allowNegativeStock: input.allowNegativeStock,
  });

  return { id: wastageEntryId };
}

export async function recordKitchenUse(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    usedAt: Date;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
  },
): Promise<{ id: string; costPaise: number }> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("KITCHEN_USE_QTY_ZERO");

  const settings = await ensureInventorySettings(tx);
  const delta = d(0).sub(qty);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(delta) },
  });

  // Placeholder row so consume can reference it; cost updated after FIFO alloc.
  const row = await tx.kitchenUseEntry.create({
    data: {
      inventoryItemId: item.id,
      usedAt: input.usedAt,
      qtyBase: qty,
      costPaise: 0,
      note: (input.note ?? "").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  const allocations = await consumeFromBatchesFifo(tx, {
    inventoryItemId: item.id,
    qtyBase: qty,
    occurredAt: input.usedAt,
    referenceType: "kitchen_use",
    referenceId: row.id,
    orderId: null,
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegativeStock,
  });

  const costPaise =
    settings.costingMethod === "FIFO"
      ? sumAllocationCostPaise(allocations)
      : allocationCostPaise(
          qty,
          itemUnitCostPaisePerBase(item, settings.costingMethod),
        );

  if (costPaise !== 0) {
    await tx.kitchenUseEntry.update({
      where: { id: row.id },
      data: { costPaise },
    });
  }

  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.usedAt,
      type: "KITCHEN_USE",
      qtyDeltaBase: delta,
      referenceType: "kitchen_use",
      referenceId: row.id,
      note: (input.note ?? "Kitchen use").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  return { id: row.id, costPaise };
}

export async function recordStockSale(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    qtyBase: Prisma.Decimal;
    /** Selling price in paise per 1 base unit. */
    ratePaisePerBase: Prisma.Decimal;
    soldAt: Date;
    buyerName?: string;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
  },
): Promise<{ id: string; totalPaise: number; costPaise: number }> {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.inventoryItemId, active: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const qty = input.qtyBase.abs();
  if (qty.equals(D0)) throw new Error("STOCK_SALE_QTY_ZERO");

  const rate = input.ratePaisePerBase;
  if (rate.lessThan(D0)) throw new Error("STOCK_SALE_RATE_INVALID");

  const settings = await ensureInventorySettings(tx);
  const totalPaise = Math.max(0, Math.round(Number(qty.mul(rate).toString())));

  const delta = d(0).sub(qty);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(delta) },
  });

  const row = await tx.stockSaleEntry.create({
    data: {
      inventoryItemId: item.id,
      soldAt: input.soldAt,
      qtyBase: qty,
      ratePaisePerBase: rate,
      totalPaise,
      costPaise: 0,
      buyerName: (input.buyerName ?? "").trim().slice(0, 200),
      note: (input.note ?? "").trim().slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  const allocations = await consumeFromBatchesFifo(tx, {
    inventoryItemId: item.id,
    qtyBase: qty,
    occurredAt: input.soldAt,
    referenceType: "stock_sale",
    referenceId: row.id,
    orderId: null,
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegativeStock,
  });

  const costPaise =
    settings.costingMethod === "FIFO"
      ? sumAllocationCostPaise(allocations)
      : allocationCostPaise(
          qty,
          itemUnitCostPaisePerBase(item, settings.costingMethod),
        );

  if (costPaise !== 0) {
    await tx.stockSaleEntry.update({
      where: { id: row.id },
      data: { costPaise },
    });
  }

  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      occurredAt: input.soldAt,
      type: "STOCK_SALE",
      qtyDeltaBase: delta,
      referenceType: "stock_sale",
      referenceId: row.id,
      note: [
        totalPaise > 0 ? `₹${(totalPaise / 100).toFixed(2)}` : "",
        (input.buyerName ?? "").trim(),
        (input.note ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  return { id: row.id, totalPaise, costPaise };
}

export type AuditLineInput = {
  inventoryItemId: string;
  countedBase: Prisma.Decimal;
};

export async function recordStockAudit(
  tx: Prisma.TransactionClient,
  input: {
    auditedAt: Date;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
    lines: AuditLineInput[];
  },
): Promise<{ auditId: string }> {
  if (input.lines.length === 0) throw new Error("AUDIT_EMPTY");

  const audit = await tx.stockAudit.create({
    data: {
      auditedAt: input.auditedAt,
      note: (input.note ?? "").slice(0, 2000),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  for (const ln of input.lines) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: ln.inventoryItemId, active: true },
    });
    if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
    const system = item.stockOnHandBase;
    const counted = ln.countedBase;
    const variance = counted.sub(system);

    await tx.stockAuditLine.create({
      data: {
        stockAuditId: audit.id,
        inventoryItemId: item.id,
        countedBase: counted,
        systemBaseSnapshot: system,
        varianceBase: variance,
      },
    });

    if (variance.equals(D0)) continue;

    const type = variance.greaterThan(D0) ? "AUDIT_SURPLUS" : "AUDIT_SHORTAGE";
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { stockOnHandBase: counted },
    });

    if (variance.greaterThan(D0)) {
      await createInboundBatch(tx, {
        inventoryItemId: item.id,
        receivedAt: input.auditedAt,
        sourceType: "AUDIT_SURPLUS",
        sourceId: audit.id,
        qtyBase: variance,
        expiryDate: null,
        lotCode: "AUDIT",
        purchaseLineId: null,
        unitCostPaisePerBase: item.avgCostPaisePerBase,
      });
    } else {
      await consumeFromBatchesFifo(tx, {
        inventoryItemId: item.id,
        qtyBase: variance.abs(),
        occurredAt: input.auditedAt,
        referenceType: "stock_audit",
        referenceId: audit.id,
        orderId: null,
        createdByUserId: input.createdByUserId ?? null,
        allowNegative: input.allowNegativeStock,
      });
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: item.id,
        occurredAt: input.auditedAt,
        type,
        qtyDeltaBase: variance,
        referenceType: "stock_audit",
        referenceId: audit.id,
        note: (input.note ?? "").slice(0, 300),
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  return { auditId: audit.id };
}
