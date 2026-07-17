import { Prisma, type PurchasePaymentType } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { createInboundBatch } from "@/lib/inventory/batch-ops";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  allocateNextPurchaseSequence,
  nextPurchaseBatchRef,
} from "@/lib/inventory/purchase-ref";

/**
 * Thrown when a purchase cannot be safely reversed because its received stock
 * was already used (consumed, returned, or its batch is missing).
 */
export class PurchaseDeleteBlockedError extends Error {
  constructor(public reason: PurchaseDeleteBlockReason) {
    super(reason);
    this.name = "PurchaseDeleteBlockedError";
  }
}

export type PurchaseDeleteBlockReason =
  | "PURCHASE_HAS_RETURNS"
  | "PURCHASE_STOCK_CONSUMED"
  | "PURCHASE_BATCH_MISSING";

export type PurchaseLineInput = {
  inventoryItemId: string;
  qtyPurchase: Prisma.Decimal;
  ratePaisePerPurchaseUnit: number;
  expiryDate?: Date | null;
  lotCode?: string;
};

export type CreatePurchaseInput = {
  supplierId: string;
  purchasedAt: Date;
  paymentType: PurchasePaymentType;
  creditDays?: number | null;
  notes?: string;
  createdByUserId?: string | null;
  lines: PurchaseLineInput[];
};

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

type PreparedLine = {
  item: {
    id: string;
    stockOnHandBase: Prisma.Decimal;
    avgCostPaisePerBase: Prisma.Decimal;
    lastPurchasePaisePerBase: Prisma.Decimal;
    baseUnitsPerPurchaseUnit: Prisma.Decimal;
  };
  qtyPurchase: Prisma.Decimal;
  ratePaisePerPurchaseUnit: number;
  lineTotalPaise: number;
  qtyBase: Prisma.Decimal;
  expiryDate: Date | null;
  lotCode: string;
};

export async function createPurchaseInTransaction(
  tx: Prisma.TransactionClient,
  input: CreatePurchaseInput,
): Promise<{ purchaseId: string; batchRef: string }> {
  if (input.lines.length === 0) {
    throw new Error("PURCHASE_EMPTY");
  }

  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, active: true },
  });
  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }

  const invSettings = await ensureInventorySettings(tx);
  const now = input.purchasedAt;
  const seq = await allocateNextPurchaseSequence(tx, now);
  const batchRef = nextPurchaseBatchRef(now, seq);

  const creditDaysResolved =
    input.paymentType === "CREDIT"
      ? (input.creditDays ?? supplier.defaultCreditDays ?? 15)
      : null;

  const dueAt =
    input.paymentType === "CREDIT" && creditDaysResolved != null
      ? addDays(now, creditDaysResolved)
      : null;

  const prepared: PreparedLine[] = [];
  let totalPaise = 0;

  for (const ln of input.lines) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: ln.inventoryItemId, active: true },
    });
    if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");

    const qtyBase = ln.qtyPurchase.mul(item.baseUnitsPerPurchaseUnit);
    const lineTotal = ln.qtyPurchase
      .mul(d(ln.ratePaisePerPurchaseUnit))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
    if (!Number.isFinite(lineTotal) || lineTotal < 0) {
      throw new Error("PURCHASE_LINE_TOTAL_INVALID");
    }
    totalPaise += lineTotal;

    prepared.push({
      item,
      qtyPurchase: ln.qtyPurchase,
      ratePaisePerPurchaseUnit: ln.ratePaisePerPurchaseUnit,
      lineTotalPaise: lineTotal,
      qtyBase,
      expiryDate: ln.expiryDate ?? null,
      lotCode: (ln.lotCode ?? "").trim().slice(0, 64),
    });
  }

  const purchase = await tx.purchase.create({
    data: {
      batchRef,
      supplierId: supplier.id,
      purchasedAt: now,
      paymentType: input.paymentType,
      creditDays: creditDaysResolved,
      dueAt,
      totalPaise,
      notes: (input.notes ?? "").trim().slice(0, 2000),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await tx.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      occurredAt: now,
      kind: "PURCHASE_DEBIT",
      debitPaise: totalPaise,
      creditPaise: 0,
      referenceType: "purchase",
      referenceId: purchase.id,
      note: `Purchase ${batchRef}`,
    },
  });

  if (input.paymentType === "CASH") {
    const pay = await tx.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        paidAt: now,
        amountPaise: totalPaise,
        method: "cash",
        reference: batchRef,
        note: "Auto-settled cash purchase",
        createdByUserId: input.createdByUserId ?? null,
      },
    });
    await tx.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        occurredAt: now,
        kind: "PAYMENT_CREDIT",
        debitPaise: 0,
        creditPaise: totalPaise,
        referenceType: "supplier_payment",
        referenceId: pay.id,
        note: `Against ${batchRef}`,
      },
    });
  }

  for (const r of prepared) {
    const pl = await tx.purchaseLine.create({
      data: {
        purchaseId: purchase.id,
        inventoryItemId: r.item.id,
        qtyPurchase: r.qtyPurchase,
        ratePaisePerPurchaseUnit: r.ratePaisePerPurchaseUnit,
        lineTotalPaise: r.lineTotalPaise,
        qtyBaseReceived: r.qtyBase,
        expiryDate: r.expiryDate,
        lotCode: r.lotCode,
      },
    });

    const row = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: r.item.id },
    });
    const oldStock = row.stockOnHandBase;
    const newStock = oldStock.add(r.qtyBase);
    const lineCostPerBase =
      r.qtyBase.equals(d(0)) || r.qtyBase.abs().lessThan(d("1e-12"))
        ? d(0)
        : d(r.lineTotalPaise).div(r.qtyBase);

    let nextAvg = row.avgCostPaisePerBase;
    const nextLast = lineCostPerBase;

    if (invSettings.costingMethod === "LATEST_PURCHASE") {
      nextAvg = lineCostPerBase;
    } else {
      if (!newStock.equals(d(0))) {
        const num = oldStock
          .mul(row.avgCostPaisePerBase)
          .add(r.qtyBase.mul(lineCostPerBase));
        nextAvg = num.div(newStock).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      } else {
        nextAvg = lineCostPerBase;
      }
    }

    await tx.inventoryItem.update({
      where: { id: row.id },
      data: {
        stockOnHandBase: newStock,
        avgCostPaisePerBase: nextAvg,
        lastPurchasePaisePerBase: nextLast,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: row.id,
        occurredAt: now,
        type: "PURCHASE_RECEIPT",
        qtyDeltaBase: r.qtyBase,
        referenceType: "purchase_line",
        referenceId: pl.id,
        note: batchRef,
        createdByUserId: input.createdByUserId ?? null,
      },
    });

    await createInboundBatch(tx, {
      inventoryItemId: row.id,
      receivedAt: now,
      sourceType: "PURCHASE_LINE",
      sourceId: pl.id,
      qtyBase: r.qtyBase,
      expiryDate: r.expiryDate,
      lotCode: r.lotCode || batchRef,
      purchaseLineId: pl.id,
      unitCostPaisePerBase: lineCostPerBase,
    });
  }

  return { purchaseId: purchase.id, batchRef };
}

/**
 * Recompute an item's average and last purchase cost from its remaining
 * purchase-backed batches, ignoring lines from `excludePurchaseId`.
 */
async function recomputeItemCosting(
  tx: Prisma.TransactionClient,
  itemId: string,
  excludePurchaseId: string,
): Promise<void> {
  const settings = await ensureInventorySettings(tx);

  const lastLine = await tx.purchaseLine.findFirst({
    where: {
      inventoryItemId: itemId,
      purchaseId: { not: excludePurchaseId },
      qtyBaseReceived: { gt: 0 },
    },
    orderBy: { purchase: { purchasedAt: "desc" } },
    select: { lineTotalPaise: true, qtyBaseReceived: true },
  });

  const data: Prisma.InventoryItemUpdateInput = {};

  if (lastLine) {
    const lastCost = d(lastLine.lineTotalPaise)
      .div(lastLine.qtyBaseReceived)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    data.lastPurchasePaisePerBase = lastCost;
    if (settings.costingMethod === "LATEST_PURCHASE") {
      data.avgCostPaisePerBase = lastCost;
    }
  }

  if (settings.costingMethod !== "LATEST_PURCHASE") {
    const batches = await tx.inventoryBatch.findMany({
      where: {
        inventoryItemId: itemId,
        purchaseLineId: { not: null },
        remainingQtyBase: { gt: 0 },
      },
      include: {
        purchaseLine: { select: { lineTotalPaise: true, qtyBaseReceived: true } },
      },
    });

    let weightedSum = D0;
    let qtySum = D0;
    for (const b of batches) {
      if (!b.purchaseLine || !b.purchaseLine.qtyBaseReceived.greaterThan(D0)) {
        continue;
      }
      const costPerBase = d(b.purchaseLine.lineTotalPaise).div(
        b.purchaseLine.qtyBaseReceived,
      );
      weightedSum = weightedSum.add(b.remainingQtyBase.mul(costPerBase));
      qtySum = qtySum.add(b.remainingQtyBase);
    }

    if (qtySum.greaterThan(D0)) {
      data.avgCostPaisePerBase = weightedSum
        .div(qtySum)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    }
  }

  if (Object.keys(data).length > 0) {
    await tx.inventoryItem.update({ where: { id: itemId }, data });
  }
}

/**
 * Safely reverse and delete a purchase. Only permitted when none of the
 * received stock has been used: no returns against the purchase, and every
 * batch it created is still fully on hand. Reverses stock, batches, stock
 * movements, the supplier ledger debit, and any auto-settled cash payment,
 * then recomputes item costing.
 */
export async function deletePurchaseInTransaction(
  tx: Prisma.TransactionClient,
  purchaseId: string,
): Promise<void> {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { lines: true },
  });
  if (!purchase) {
    throw new Error("PURCHASE_NOT_FOUND");
  }

  const returnCount = await tx.purchaseReturn.count({ where: { purchaseId } });
  if (returnCount > 0) {
    throw new PurchaseDeleteBlockedError("PURCHASE_HAS_RETURNS");
  }

  // Validate every line's batch is still fully unconsumed before mutating.
  for (const line of purchase.lines) {
    const batch = await tx.inventoryBatch.findUnique({
      where: { purchaseLineId: line.id },
      select: { id: true, qtyReceivedBase: true, remainingQtyBase: true },
    });
    if (!batch) {
      throw new PurchaseDeleteBlockedError("PURCHASE_BATCH_MISSING");
    }
    if (!batch.remainingQtyBase.equals(batch.qtyReceivedBase)) {
      throw new PurchaseDeleteBlockedError("PURCHASE_STOCK_CONSUMED");
    }
    const consumptions = await tx.inventoryBatchConsumption.count({
      where: { batchId: batch.id },
    });
    if (consumptions > 0) {
      throw new PurchaseDeleteBlockedError("PURCHASE_STOCK_CONSUMED");
    }
  }

  const affectedItemIds = new Set<string>();
  for (const line of purchase.lines) {
    affectedItemIds.add(line.inventoryItemId);

    const item = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: line.inventoryItemId },
      select: { id: true, stockOnHandBase: true },
    });
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { stockOnHandBase: item.stockOnHandBase.sub(line.qtyBaseReceived) },
    });

    await tx.inventoryMovement.deleteMany({
      where: { referenceType: "purchase_line", referenceId: line.id },
    });
    await tx.inventoryBatch.deleteMany({ where: { purchaseLineId: line.id } });
  }

  // Reverse the supplier ledger debit for the purchase.
  await tx.supplierLedgerEntry.deleteMany({
    where: { referenceType: "purchase", referenceId: purchase.id },
  });

  // Reverse the auto-settled cash payment (and its ledger credit) if any.
  if (purchase.paymentType === "CASH") {
    const payments = await tx.supplierPayment.findMany({
      where: {
        supplierId: purchase.supplierId,
        reference: purchase.batchRef,
        method: "cash",
      },
      select: { id: true },
    });
    for (const pay of payments) {
      await tx.supplierLedgerEntry.deleteMany({
        where: { referenceType: "supplier_payment", referenceId: pay.id },
      });
      await tx.supplierPayment.delete({ where: { id: pay.id } });
    }
  }

  for (const itemId of affectedItemIds) {
    await recomputeItemCosting(tx, itemId, purchaseId);
  }

  // Cascade-deletes the purchase lines.
  await tx.purchase.delete({ where: { id: purchaseId } });
}
