import type { Prisma, WastageType } from "@prisma/client";

import { D0 } from "@/lib/inventory/decimal-utils";
import { expandMenuItemConsumption } from "@/lib/inventory/recipe-resolve";
import { recordWastage } from "@/lib/inventory/stock-ops";

export async function recordMenuWastage(
  tx: Prisma.TransactionClient,
  input: {
    menuItemId: string;
    variationId: string;
    quantity: Prisma.Decimal;
    wastedAt: Date;
    wastageType: WastageType;
    note?: string;
    createdByUserId?: string | null;
    allowNegativeStock: boolean;
  },
): Promise<{ id: string; ingredientWastageCount: number }> {
  const variation = await tx.menuItemVariation.findFirst({
    where: { id: input.variationId, itemId: input.menuItemId },
    select: { id: true, name: true },
  });
  if (!variation) throw new Error("MENU_VARIATION_NOT_FOUND");

  const menuItem = await tx.menuItem.findFirst({
    where: { id: input.menuItemId },
    select: { id: true, name: true },
  });
  if (!menuItem) throw new Error("MENU_ITEM_NOT_FOUND");

  const qty = input.quantity.abs();
  if (qty.equals(D0)) throw new Error("WASTAGE_QTY_ZERO");

  const consumption = await expandMenuItemConsumption(
    tx,
    input.menuItemId,
    input.variationId,
    input.wastedAt,
    qty,
  );
  if (consumption.size === 0) {
    throw new Error("RECIPE_NOT_FOUND");
  }

  const row = await tx.menuWastageEntry.create({
    data: {
      menuItemId: input.menuItemId,
      variationId: input.variationId,
      quantity: qty,
      wastedAt: input.wastedAt,
      wastageType: input.wastageType,
      note: (input.note ?? "").slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true },
  });

  const dishLabel = `${menuItem.name} · ${variation.name} × ${qty.toString()}`;
  const userNote = (input.note ?? "").trim();
  const wastageNote = userNote ? `${dishLabel} — ${userNote}` : dishLabel;

  let ingredientWastageCount = 0;
  for (const [inventoryItemId, qtyBase] of consumption) {
    if (!qtyBase.greaterThan(0)) continue;
    await recordWastage(tx, {
      allowNegativeStock: input.allowNegativeStock,
      inventoryItemId,
      qtyBase,
      wastedAt: input.wastedAt,
      wastageType: input.wastageType,
      note: wastageNote,
      createdByUserId: input.createdByUserId ?? null,
      menuWastageEntryId: row.id,
    });
    ingredientWastageCount += 1;
  }

  if (ingredientWastageCount === 0) {
    throw new Error("RECIPE_HAS_NO_INGREDIENTS");
  }

  return { id: row.id, ingredientWastageCount };
}
