import type { InventoryCostingMethod, PrismaClient } from "@prisma/client";

export type InventorySettingsRow = {
  costingMethod: InventoryCostingMethod;
  restoreStockOnCancel: boolean;
  allowNegativeStock: boolean;
};

export async function ensureInventorySettings(
  tx: Pick<PrismaClient, "inventorySettings">,
): Promise<InventorySettingsRow> {
  const row = await tx.inventorySettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  return {
    costingMethod: row.costingMethod,
    restoreStockOnCancel: row.restoreStockOnCancel,
    allowNegativeStock: row.allowNegativeStock,
  };
}
