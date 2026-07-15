import type { AdjustmentReason, Prisma, WastageType } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { consumeFromBatchesFifo, createInboundBatch } from "@/lib/inventory/batch-ops";
import {
  costPaisePerBaseFromPurchaseRate,
  nextCostsAfterInbound,
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

  if (rate != null) {
    const settings = await ensureInventorySettings(tx);
    const costPerBase = costPaisePerBaseFromPurchaseRate(
      rate,
      item.baseUnitsPerPurchaseUnit,
    );
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

  const costPaise = Math.max(
    0,
    Math.round(Number(qty.mul(item.avgCostPaisePerBase).toString())),
  );

  const delta = d(0).sub(qty);
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { stockOnHandBase: item.stockOnHandBase.add(delta) },
  });

  const row = await tx.kitchenUseEntry.create({
    data: {
      inventoryItemId: item.id,
      usedAt: input.usedAt,
      qtyBase: qty,
      costPaise,
      note: (input.note ?? "").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await consumeFromBatchesFifo(tx, {
    inventoryItemId: item.id,
    qtyBase: qty,
    occurredAt: input.usedAt,
    referenceType: "kitchen_use",
    referenceId: row.id,
    orderId: null,
    createdByUserId: input.createdByUserId ?? null,
    allowNegative: input.allowNegativeStock,
  });

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
