import { Prisma, type PurchasePaymentType } from "@prisma/client";

import { d } from "@/lib/inventory/decimal-utils";
import { createInboundBatch } from "@/lib/inventory/batch-ops";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  allocateNextPurchaseSequence,
  nextPurchaseBatchRef,
} from "@/lib/inventory/purchase-ref";

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
    });
  }

  return { purchaseId: purchase.id, batchRef };
}
