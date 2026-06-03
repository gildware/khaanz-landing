import type { Prisma } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import {
  consumeFromBatchesFifo,
  restoreToBatches,
} from "@/lib/inventory/batch-ops";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { planOrderConsumption } from "@/lib/inventory/plan-order-consumption";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";

export class InventoryInsufficientError extends Error {
  readonly code = "INVENTORY_INSUFFICIENT" as const;

  readonly shortages: { inventoryItemId: string; needed: string; onHand: string }[];

  constructor(
    shortages: { inventoryItemId: string; needed: string; onHand: string }[],
  ) {
    super("INVENTORY_INSUFFICIENT");
    this.name = "InventoryInsufficientError";
    this.shortages = shortages;
  }
}

export async function applyOrderInventoryDeduction(
  tx: Prisma.TransactionClient,
  orderId: string,
  parsed: Pick<OrderCreateParsed, "lines">,
  createdByUserId: string | null,
  at: Date,
): Promise<void> {
  const settings = await ensureInventorySettings(tx);
  const consumption = await planOrderConsumption(tx, parsed, at);
  if (consumption.size === 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { inventoryDeductedAt: at },
    });
    return;
  }

  const itemIds = [...consumption.keys()];
  // Deduct for every ingredient a live recipe references, including ones that
  // have been marked inactive. Filtering by active here would treat an inactive
  // ingredient as "missing" and block the sale even when negative stock is allowed.
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds } },
  });
  const byId = new Map(items.map((r) => [r.id, r]));

  const missingIds = itemIds.filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    throw new InventoryInsufficientError(
      missingIds.map((id) => ({
        inventoryItemId: id,
        needed: (consumption.get(id) ?? D0).toString(),
        onHand: "missing",
      })),
    );
  }

  if (!settings.allowNegativeStock) {
    const shortages: {
      inventoryItemId: string;
      needed: string;
      onHand: string;
    }[] = [];
    for (const [id, need] of consumption) {
      const row = byId.get(id)!;
      const onHand = row.stockOnHandBase;
      if (onHand.lessThan(need)) {
        shortages.push({
          inventoryItemId: id,
          needed: need.toString(),
          onHand: onHand.toString(),
        });
      }
    }
    if (shortages.length > 0) {
      throw new InventoryInsufficientError(shortages);
    }
  }

  for (const [inventoryItemId, qty] of consumption) {
    const need = qty;
    if (need.equals(D0)) continue;
    const row = byId.get(inventoryItemId)!;

    const delta = d(0).sub(need);
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { stockOnHandBase: row.stockOnHandBase.add(delta) },
    });

    await consumeFromBatchesFifo(tx, {
      inventoryItemId,
      qtyBase: need,
      occurredAt: at,
      referenceType: "order",
      referenceId: orderId,
      orderId,
      createdByUserId,
      allowNegative: settings.allowNegativeStock,
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        occurredAt: at,
        type: "POS_OR_WEB_SALE",
        qtyDeltaBase: delta,
        referenceType: "order",
        referenceId: orderId,
        orderId,
        note: "",
        createdByUserId,
      },
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: { inventoryDeductedAt: at },
  });
}

/**
 * Reconciles ingredient stock when an order's lines are edited in place.
 * Reverses the order's current FIFO consumption (adding stock back and
 * deleting the old consumption rows so a later cancel can't double-restore),
 * then re-deducts based on the new lines. Leaves `inventoryRestoredAt`
 * untouched so the cancel-restore flow keeps working on the edited order.
 */
export async function reapplyOrderInventoryForEdit(
  tx: Prisma.TransactionClient,
  orderId: string,
  newLines: Pick<OrderCreateParsed, "lines">,
  createdByUserId: string | null,
  at: Date,
): Promise<void> {
  const rows = await tx.inventoryBatchConsumption.findMany({
    where: { orderId, referenceType: "order" },
  });

  if (rows.length > 0) {
    const restoreByBatch = new Map<string, Prisma.Decimal>();
    const restoreByItem = new Map<string, Prisma.Decimal>();
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
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId,
          occurredAt: at,
          type: "ORDER_CANCEL_RESTORE",
          qtyDeltaBase: qty,
          referenceType: "order_edit",
          referenceId: orderId,
          orderId,
          note: "Order edited — previous items reversed",
          createdByUserId,
        },
      });
    }

    // Drop the old consumption rows so a future cancel restores only the
    // re-deducted quantities (not the already-reversed originals).
    await tx.inventoryBatchConsumption.deleteMany({
      where: { orderId, referenceType: "order" },
    });
  }

  await applyOrderInventoryDeduction(tx, orderId, newLines, createdByUserId, at);
}

export async function applyOrderInventoryRestore(
  tx: Prisma.TransactionClient,
  orderId: string,
  parsed: Pick<OrderCreateParsed, "lines">,
  createdByUserId: string | null,
  at: Date,
): Promise<void> {
  // Restore by reversing the exact FIFO consumption recorded earlier.
  const restoredByItem = await restoreToBatches(tx, {
    orderId,
    occurredAt: at,
    createdByUserId,
  });

  // If nothing was deducted (or nothing was batch-tracked), just mark restored.
  if (restoredByItem.size === 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { inventoryRestoredAt: at },
    });
    return;
  }

  const itemIds = [...restoredByItem.keys()];
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds } },
  });
  const byId = new Map(items.map((r) => [r.id, r]));

  for (const [inventoryItemId, delta] of restoredByItem) {
    const row = byId.get(inventoryItemId);
    if (!row) continue;
    if (delta.equals(D0)) continue;
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { stockOnHandBase: row.stockOnHandBase.add(delta) },
    });
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        occurredAt: at,
        type: "ORDER_CANCEL_RESTORE",
        qtyDeltaBase: delta,
        referenceType: "order_cancel",
        referenceId: orderId,
        orderId,
        note: "",
        createdByUserId,
      },
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: { inventoryRestoredAt: at },
  });
}
