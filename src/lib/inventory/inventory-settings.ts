import type { InventoryCostingMethod, PrismaClient } from "@prisma/client";

export type InventorySettingsRow = {
  costingMethod: InventoryCostingMethod;
  restoreStockOnCancel: boolean;
  allowNegativeStock: boolean;
};

/**
 * Read inventory settings. Prefer findUnique — upsert on every read was
 * adding extra round-trips to the remote DB on every inventory page load.
 */
export async function ensureInventorySettings(
  tx: Pick<PrismaClient, "inventorySettings">,
): Promise<InventorySettingsRow> {
  const existing = await tx.inventorySettings.findUnique({
    where: { id: "default" },
  });
  if (existing) {
    return {
      costingMethod: existing.costingMethod,
      restoreStockOnCancel: existing.restoreStockOnCancel,
      allowNegativeStock: existing.allowNegativeStock,
    };
  }

  const row = await tx.inventorySettings.create({
    data: { id: "default" },
  });
  return {
    costingMethod: row.costingMethod,
    restoreStockOnCancel: row.restoreStockOnCancel,
    allowNegativeStock: row.allowNegativeStock,
  };
}
