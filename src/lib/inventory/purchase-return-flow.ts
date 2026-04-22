import { Prisma } from "@prisma/client";

import { d } from "@/lib/inventory/decimal-utils";
import { consumeFromSpecificBatch } from "@/lib/inventory/batch-ops";

export type PurchaseReturnLineInput = {
  inventoryItemId: string;
  inventoryBatchId: string;
  qtyPurchase: Prisma.Decimal;
  creditPaise: number;
};

export type CreatePurchaseReturnInput = {
  supplierId: string;
  purchaseId?: string | null;
  returnedAt: Date;
  notes?: string;
  createdByUserId?: string | null;
  lines: PurchaseReturnLineInput[];
};

export async function createPurchaseReturnInTransaction(
  tx: Prisma.TransactionClient,
  input: CreatePurchaseReturnInput,
): Promise<{ returnId: string }> {
  if (input.lines.length === 0) throw new Error("RETURN_EMPTY");

  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, active: true },
  });
  if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");

  if (input.purchaseId) {
    const p = await tx.purchase.findFirst({
      where: { id: input.purchaseId, supplierId: supplier.id },
    });
    if (!p) throw new Error("PURCHASE_NOT_FOUND");
  }

  let totalCredit = 0;
  const rows: {
    itemId: string;
    batchId: string;
    qtyPurchase: Prisma.Decimal;
    qtyBase: Prisma.Decimal;
    creditPaise: number;
  }[] = [];

  for (const ln of input.lines) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: ln.inventoryItemId, active: true },
    });
    if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
    const batch = await tx.inventoryBatch.findUnique({
      where: { id: ln.inventoryBatchId },
      select: { id: true, inventoryItemId: true, purchaseLineId: true },
    });
    if (!batch || batch.inventoryItemId !== item.id) {
      throw new Error("BATCH_NOT_FOUND");
    }
    if (input.purchaseId && batch.purchaseLineId) {
      const pl = await tx.purchaseLine.findUnique({
        where: { id: batch.purchaseLineId },
        select: { purchaseId: true },
      });
      if (!pl || pl.purchaseId !== input.purchaseId) {
        throw new Error("BATCH_NOT_FROM_PURCHASE");
      }
    }
    const qtyBase = ln.qtyPurchase.mul(item.baseUnitsPerPurchaseUnit);
    const credit = Math.floor(ln.creditPaise);
    if (!Number.isFinite(credit) || credit < 0) {
      throw new Error("RETURN_CREDIT_INVALID");
    }
    totalCredit += credit;
    rows.push({
      itemId: item.id,
      batchId: batch.id,
      qtyPurchase: ln.qtyPurchase,
      qtyBase,
      creditPaise: credit,
    });
  }

  const ret = await tx.purchaseReturn.create({
    data: {
      supplierId: supplier.id,
      purchaseId: input.purchaseId ?? null,
      returnedAt: input.returnedAt,
      totalCreditPaise: totalCredit,
      notes: (input.notes ?? "").trim().slice(0, 2000),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await tx.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      occurredAt: input.returnedAt,
      kind: "RETURN_CREDIT",
      debitPaise: 0,
      creditPaise: totalCredit,
      referenceType: "purchase_return",
      referenceId: ret.id,
      note: (input.notes ?? "").trim().slice(0, 200),
    },
  });

  for (const r of rows) {
    await tx.purchaseReturnLine.create({
      data: {
        returnId: ret.id,
        inventoryItemId: r.itemId,
        inventoryBatchId: r.batchId,
        qtyPurchase: r.qtyPurchase,
        qtyBase: r.qtyBase,
        creditPaise: r.creditPaise,
      },
    });

    const row = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: r.itemId },
    });
    const delta = d(0).sub(r.qtyBase);
    await tx.inventoryItem.update({
      where: { id: r.itemId },
      data: { stockOnHandBase: row.stockOnHandBase.add(delta) },
    });

    await consumeFromSpecificBatch(tx, {
      batchId: r.batchId,
      inventoryItemId: r.itemId,
      qtyBase: r.qtyBase,
      occurredAt: input.returnedAt,
      referenceType: "purchase_return",
      referenceId: ret.id,
      orderId: null,
      createdByUserId: input.createdByUserId ?? null,
      allowNegative: false,
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: r.itemId,
        occurredAt: input.returnedAt,
        type: "PURCHASE_RETURN",
        qtyDeltaBase: delta,
        referenceType: "purchase_return",
        referenceId: ret.id,
        note: "",
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  return { returnId: ret.id };
}
