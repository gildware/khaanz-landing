import type { Prisma } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { consumeFromBatchesFifo } from "@/lib/inventory/batch-ops";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";

export async function applyVendorSaleInventoryDeduction(
  tx: Prisma.TransactionClient,
  saleId: string,
  consumptionByItem: Map<string, Prisma.Decimal>,
  createdByUserId: string | null,
  at: Date,
): Promise<void> {
  const settings = await ensureInventorySettings(tx);
  if (consumptionByItem.size === 0) return;

  const itemIds = [...consumptionByItem.keys()];
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds }, active: true },
    select: { id: true, stockOnHandBase: true },
  });
  const byId = new Map(items.map((r) => [r.id, r]));

  for (const inventoryItemId of itemIds) {
    const row = byId.get(inventoryItemId);
    if (!row) throw new Error("INVENTORY_ITEM_NOT_FOUND");
    const need = consumptionByItem.get(inventoryItemId) ?? D0;
    if (need.equals(D0)) continue;

    const delta = d(0).sub(need);
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { stockOnHandBase: row.stockOnHandBase.add(delta) },
    });

    await consumeFromBatchesFifo(tx, {
      inventoryItemId,
      qtyBase: need,
      occurredAt: at,
      referenceType: "vendor_sale",
      referenceId: saleId,
      orderId: null,
      createdByUserId,
      allowNegative: settings.allowNegativeStock,
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId,
        occurredAt: at,
        type: "VENDOR_SALE",
        qtyDeltaBase: delta,
        referenceType: "vendor_sale",
        referenceId: saleId,
        orderId: null,
        note: "",
        createdByUserId,
      },
    });
  }
}

