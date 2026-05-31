import type { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_PAYMENT_METHODS_JSON = [
  { id: "cash", name: "Cash" },
  { id: "upi", name: "UPI" },
  { id: "mpay", name: "Mpay" },
] as const;

/**
 * Deletes all tenant/business data and restores single-tenant config rows to
 * defaults. Preserves `User` rows (admin logins).
 */
export async function resetAllTenantData(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  const tx = prisma;

  await tx.payrollEmployeeLine.deleteMany({});
  await tx.payrollRun.deleteMany({});
  await tx.employee.deleteMany({});

  await tx.expenseEntry.deleteMany({});
  await tx.expenseCategory.deleteMany({});

  await tx.personalUseEntry.deleteMany({});

  await tx.vendorSale.deleteMany({});
  await tx.vendorLedgerEntry.deleteMany({});
  await tx.vendorPayment.deleteMany({});
  await tx.vendorSellableMenuItem.deleteMany({});
  await tx.vendor.deleteMany({});

  await tx.otpChallenge.deleteMany({});

  await tx.order.deleteMany({});
  await tx.orderCounterDay.deleteMany({});
  await tx.customer.deleteMany({});

  await tx.stockAudit.deleteMany({});
  await tx.wastageEntry.deleteMany({});
  await tx.stockAdjustment.deleteMany({});
  await tx.inventoryBatchConsumption.deleteMany({});
  await tx.inventoryMovement.deleteMany({});

  await tx.purchaseReturnLine.deleteMany({});
  await tx.purchaseReturn.deleteMany({});

  await tx.supplierPayment.deleteMany({});
  await tx.supplierLedgerEntry.deleteMany({});
  await tx.purchase.deleteMany({});

  await tx.inventoryBatch.deleteMany({});

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

  await tx.inventoryItem.deleteMany({});
  await tx.supplier.deleteMany({});

  await tx.purchaseCounterDay.deleteMany({});

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
