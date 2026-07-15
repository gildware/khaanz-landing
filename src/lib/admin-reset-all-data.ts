import type { Prisma, PrismaClient } from "@prisma/client";

import type { AdminResetScopes } from "@/lib/admin-reset-scopes";
import { allAdminResetScopes } from "@/lib/admin-reset-scopes";

const DEFAULT_PAYMENT_METHODS_JSON = [
  { id: "cash", name: "Cash" },
  { id: "upi", name: "UPI" },
  { id: "mpay", name: "Mpay" },
] as const;

type Tx = PrismaClient | Prisma.TransactionClient;

async function deleteMenuCatalog(tx: Tx): Promise<void> {
  // Menu wastage references menu items (Restrict).
  await tx.wastageEntry.deleteMany({});
  await tx.menuWastageEntry.deleteMany({});

  // Vendor sale lines / mappings reference menu items (Restrict).
  await tx.vendorSale.deleteMany({});
  await tx.vendorSellableMenuItem.deleteMany({});

  await tx.menuComboComponent.deleteMany({});
  await tx.menuCombo.deleteMany({});
  await tx.menuItemAddon.deleteMany({});
  await tx.menuItemVariation.deleteMany({});
  await tx.menuItem.deleteMany({});
  await tx.menuGlobalAddon.deleteMany({});

  for (;;) {
    const n = await tx.category.deleteMany({
      where: { parentId: { not: null } },
    });
    if (n.count === 0) break;
  }
  await tx.category.deleteMany({});
}

async function deleteInventoryHistory(tx: Tx, menuAlreadyCleared: boolean): Promise<void> {
  await tx.stockAudit.deleteMany({});
  if (!menuAlreadyCleared) {
    await tx.wastageEntry.deleteMany({});
    await tx.menuWastageEntry.deleteMany({});
  }
  await tx.kitchenUseEntry.deleteMany({});
  await tx.stockAdjustment.deleteMany({});
  await tx.inventoryBatchConsumption.deleteMany({});
  await tx.inventoryMovement.deleteMany({});
  await tx.inventoryBatch.deleteMany({});
}

async function deleteSuppliersAndPurchases(tx: Tx): Promise<void> {
  await tx.purchaseReturnLine.deleteMany({});
  await tx.purchaseReturn.deleteMany({});
  await tx.supplierPayment.deleteMany({});
  await tx.supplierLedgerEntry.deleteMany({});
  await tx.purchase.deleteMany({});
  await tx.supplier.deleteMany({});
  await tx.purchaseCounterDay.deleteMany({});
}

async function deleteVendors(tx: Tx): Promise<void> {
  await tx.vendorSale.deleteMany({});
  await tx.vendorLedgerEntry.deleteMany({});
  await tx.vendorPayment.deleteMany({});
  await tx.vendorSellableMenuItem.deleteMany({});
  await tx.vendor.deleteMany({});
}

/**
 * Deletes selected tenant/business data. Preserves `User` rows (admin logins)
 * and `InventoryItem` catalog rows unless stock fields are zeroed via scope.
 */
export async function resetTenantData(
  prisma: PrismaClient | Prisma.TransactionClient,
  scopes: AdminResetScopes,
): Promise<void> {
  const tx = prisma;

  if (scopes.payroll) {
    await tx.payrollEmployeeLine.deleteMany({});
    await tx.payrollRun.deleteMany({});
    await tx.employee.deleteMany({});
  }

  if (scopes.expenses) {
    await tx.expenseEntry.deleteMany({});
    await tx.expenseCategory.deleteMany({});
  }

  if (scopes.personalUse) {
    await tx.personalUseEntry.deleteMany({});
  }

  if (scopes.vendors) {
    await deleteVendors(tx);
  }

  if (scopes.orders) {
    await tx.otpChallenge.deleteMany({});
    await tx.order.deleteMany({});
    await tx.orderCounterDay.deleteMany({});
    await tx.customer.deleteMany({});
  }

  if (scopes.menu) {
    await deleteMenuCatalog(tx);
  }

  if (scopes.inventoryHistory) {
    await deleteInventoryHistory(tx, scopes.menu);
  }

  if (scopes.suppliers) {
    await deleteSuppliersAndPurchases(tx);
  }

  if (scopes.stockQuantities) {
    await tx.inventoryItem.updateMany({
      data: {
        stockOnHandBase: 0,
        avgCostPaisePerBase: 0,
        lastPurchasePaisePerBase: 0,
      },
    });
  }

  if (scopes.restaurantDefaults) {
    await tx.restaurantSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        whatsappPhoneE164: "919876543210",
        pickupStart: "11:00",
        pickupEnd: "23:00",
        deliveryStart: "11:00",
        deliveryEnd: "23:00",
        billHeader: "",
        billFooter: "",
        paymentMethodsJson: [...DEFAULT_PAYMENT_METHODS_JSON],
        floorPlanJson: { tables: [] },
      },
      update: {
        displayName: "",
        logoUrl: "",
        whatsappPhoneE164: "919876543210",
        pickupStart: "11:00",
        pickupEnd: "23:00",
        deliveryStart: "11:00",
        deliveryEnd: "23:00",
        billHeader: "",
        billFooter: "",
        paymentMethodsJson: [...DEFAULT_PAYMENT_METHODS_JSON],
        floorPlanJson: { tables: [] },
      },
    });

    await tx.inventorySettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {
        costingMethod: "WEIGHTED_AVERAGE",
        restoreStockOnCancel: true,
        allowNegativeStock: true,
      },
    });
  }
}

/** Full wipe matching a fresh install (except admin users and inventory catalog). */
export async function resetAllTenantData(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  await resetTenantData(prisma, allAdminResetScopes());
}
