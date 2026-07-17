import test from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { d } from "@/lib/inventory/decimal-utils";
import { createPurchaseInTransaction } from "@/lib/inventory/purchase-flow";
import { createPurchaseReturnInTransaction } from "@/lib/inventory/purchase-return-flow";
import { recordOpeningStock, recordStockAudit } from "@/lib/inventory/stock-ops";
import { consumeFromBatchesFifo } from "@/lib/inventory/batch-ops";
import { applyOrderInventoryRestore } from "@/lib/inventory/apply-order-inventory";

function rand(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function cleanup() {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.inventoryBatchConsumption.deleteMany({});
    await tx.kitchenUseEntry.deleteMany({});
    await tx.stockSaleEntry.deleteMany({});
    await tx.wastageEntry.deleteMany({});
    await tx.menuWastageEntry.deleteMany({});
    await tx.stockAuditLine.deleteMany({});
    await tx.stockAudit.deleteMany({});
    await tx.inventoryBatch.deleteMany({});
    await tx.inventoryMovement.deleteMany({});
    await tx.stockAdjustment.deleteMany({});
    await tx.purchaseReturnLine.deleteMany({});
    await tx.purchaseReturn.deleteMany({});
    await tx.purchaseLine.deleteMany({});
    await tx.purchase.deleteMany({});
    await tx.supplierLedgerEntry.deleteMany({});
    await tx.supplierPayment.deleteMany({});
    await tx.recipeIngredient.deleteMany({});
    await tx.recipeVersion.deleteMany({});
    await tx.personalUseEntry.deleteMany({});
    await tx.orderLine.deleteMany({});
    await tx.order.deleteMany({});
    await tx.customer.deleteMany({});
    await tx.inventoryItem.deleteMany({});
    await tx.supplier.deleteMany({});
  });
}

test("setup: clean database", async () => {
  await cleanup();
  assert.ok(true);
});

test("purchase creates batches and FIFO consumes oldest batch first", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: { name: rand("Supplier"), active: true, defaultCreditDays: 15 },
    });
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Rice"),
        category: "Dry",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    await recordOpeningStock(tx, {
      inventoryItemId: item.id,
      qtyBase: d("1000"),
      occurredAt: now,
      note: "opening",
      createdByUserId: null,
    });

    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + 1000),
      paymentType: "CREDIT",
      creditDays: 10,
      notes: "p1",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("1"),
          ratePaisePerPurchaseUnit: 5000,
          expiryDate: null,
          lotCode: "B1",
        },
      ],
    });

    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + 2000),
      paymentType: "CREDIT",
      creditDays: 10,
      notes: "p2",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("1"),
          ratePaisePerPurchaseUnit: 6000,
          expiryDate: null,
          lotCode: "B2",
        },
      ],
    });

    const batchesBefore = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: item.id },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    assert.ok(batchesBefore.length >= 3);

    const orderId = crypto.randomUUID();
    const customer = await tx.customer.create({ data: { phoneDigits: "9999999999" } });
    await tx.order.create({
      data: {
        id: orderId,
        customerId: customer.id,
        status: "PENDING",
        fulfillment: "pickup",
        scheduleMode: "asap",
        totalMinor: 0,
        currency: "INR",
        source: "pos",
        paymentMethod: "cash",
        dineInTable: "",
        lines: { create: [{ sortIndex: 0, payload: { type: "open", name: "x" } }] },
      },
    });

    await consumeFromBatchesFifo(tx, {
      inventoryItemId: item.id,
      qtyBase: d("1500"),
      occurredAt: new Date(now.getTime() + 3000),
      referenceType: "order",
      referenceId: orderId,
      orderId,
      createdByUserId: null,
      allowNegative: false,
    });

    const allocs = await tx.inventoryBatchConsumption.findMany({
      where: { orderId, referenceType: "order" },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(allocs.length > 0);
    assert.equal(allocs[0]!.batchId, batchesBefore[0]!.id);
  });
});

test("FIFO costing uses oldest batch purchase rates for COGS", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.inventorySettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        costingMethod: "FIFO",
        restoreStockOnCancel: true,
        allowNegativeStock: true,
      },
      update: { costingMethod: "FIFO" },
    });

    const supplier = await tx.supplier.create({
      data: { name: rand("Supplier"), active: true, defaultCreditDays: 15 },
    });
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Atta"),
        category: "Dry",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    // 10 kg @ ₹10/kg → 1000 paise/kg → 1 paise/g
    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + 1000),
      paymentType: "CASH",
      creditDays: null,
      notes: "cheap",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("10"),
          ratePaisePerPurchaseUnit: 1000,
          expiryDate: null,
          lotCode: "X",
        },
      ],
    });

    // 5 kg @ ₹20/kg → 2 paise/g
    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + 2000),
      paymentType: "CASH",
      creditDays: null,
      notes: "mid",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("5"),
          ratePaisePerPurchaseUnit: 2000,
          expiryDate: null,
          lotCode: "Y",
        },
      ],
    });

    // 10 kg @ ₹30/kg → 3 paise/g
    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + 3000),
      paymentType: "CASH",
      creditDays: null,
      notes: "dear",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("10"),
          ratePaisePerPurchaseUnit: 3000,
          expiryDate: null,
          lotCode: "Z",
        },
      ],
    });

    const batches = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: item.id },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    assert.equal(batches.length, 3);
    assert.equal(Number(batches[0]!.unitCostPaisePerBase.toString()), 1);
    assert.equal(Number(batches[1]!.unitCostPaisePerBase.toString()), 2);
    assert.equal(Number(batches[2]!.unitCostPaisePerBase.toString()), 3);

    // Consume 12 kg (12000 g) → 10kg@1 + 2kg@2 = 10000 + 4000 = 14000 paise
    const allocations = await consumeFromBatchesFifo(tx, {
      inventoryItemId: item.id,
      qtyBase: d("12000"),
      occurredAt: new Date(now.getTime() + 4000),
      referenceType: "order",
      referenceId: "fifo-cost-test",
      orderId: null,
      createdByUserId: null,
      allowNegative: false,
    });

    const totalCost = allocations.reduce((s, a) => s + a.costPaise, 0);
    assert.equal(totalCost, 14000);
    assert.equal(allocations.length, 2);
    assert.equal(Number(allocations[0]!.qtyBase.toString()), 10000);
    assert.equal(allocations[0]!.costPaise, 10000);
    assert.equal(Number(allocations[1]!.qtyBase.toString()), 2000);
    assert.equal(allocations[1]!.costPaise, 4000);
  });
});

test("stock audit shortage consumes batches; surplus creates new batch", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Onion"),
        category: "Veg",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    await recordOpeningStock(tx, {
      inventoryItemId: item.id,
      qtyBase: d("1000"),
      occurredAt: now,
      note: "opening",
      createdByUserId: null,
    });

    const a1 = await recordStockAudit(tx, {
      auditedAt: new Date(now.getTime() + 1000),
      note: "shortage",
      createdByUserId: null,
      allowNegativeStock: false,
      lines: [{ inventoryItemId: item.id, countedBase: d("600") }],
    });

    const cons1 = await tx.inventoryBatchConsumption.count({
      where: { referenceType: "stock_audit", referenceId: a1.auditId },
    });
    assert.ok(cons1 > 0);

    await recordStockAudit(tx, {
      auditedAt: new Date(now.getTime() + 2000),
      note: "surplus",
      createdByUserId: null,
      allowNegativeStock: false,
      lines: [{ inventoryItemId: item.id, countedBase: d("900") }],
    });

    const hasSurplusBatch = await tx.inventoryBatch.count({
      where: { inventoryItemId: item.id, sourceType: "AUDIT_SURPLUS" },
    });
    assert.ok(hasSurplusBatch > 0);
  });
});

test("purchase return reduces a specific batch remaining quantity", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({ data: { name: rand("S"), active: true } });
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Masala"),
        category: "Spices",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    const purchase = await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: now,
      paymentType: "CREDIT",
      creditDays: 10,
      notes: "",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d("1"),
          ratePaisePerPurchaseUnit: 100000,
          expiryDate: null,
          lotCode: "LOT-RET",
        },
      ],
    });

    const batch = await tx.inventoryBatch.findFirstOrThrow({
      where: { inventoryItemId: item.id, sourceType: "PURCHASE_LINE" },
      orderBy: { receivedAt: "asc" },
    });

    const before = batch.remainingQtyBase;

    await createPurchaseReturnInTransaction(tx, {
      supplierId: supplier.id,
      purchaseId: purchase.purchaseId,
      returnedAt: new Date(now.getTime() + 1000),
      notes: "return",
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          inventoryBatchId: batch.id,
          qtyPurchase: d("0.5"),
          creditPaise: 50000,
        },
      ],
    });

    const after = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: batch.id } });
    assert.ok(after.remainingQtyBase.lessThan(before));
  });
});

test("cancel restore restores the exact batches consumed for an order", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Oil"),
        category: "Oil",
        baseUnit: "ml",
        purchaseUnit: "l",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    await recordOpeningStock(tx, {
      inventoryItemId: item.id,
      qtyBase: d("2000"),
      occurredAt: now,
      note: "opening",
      createdByUserId: null,
    });

    const customer = await tx.customer.create({ data: { phoneDigits: "8888888888" } });
    const orderId = crypto.randomUUID();
    await tx.order.create({
      data: {
        id: orderId,
        customerId: customer.id,
        status: "PENDING",
        fulfillment: "pickup",
        scheduleMode: "asap",
        totalMinor: 0,
        currency: "INR",
        source: "pos",
        paymentMethod: "cash",
        dineInTable: "",
        lines: { create: [{ sortIndex: 0, payload: { type: "open", name: "x" } }] },
      },
    });

    await consumeFromBatchesFifo(tx, {
      inventoryItemId: item.id,
      qtyBase: d("500"),
      occurredAt: new Date(now.getTime() + 1000),
      referenceType: "order",
      referenceId: orderId,
      orderId,
      createdByUserId: null,
      allowNegative: false,
    });

    const before = await tx.inventoryBatch.findFirstOrThrow({
      where: { inventoryItemId: item.id },
      orderBy: { receivedAt: "asc" },
    });

    await applyOrderInventoryRestore(tx, orderId, { lines: [] }, null, new Date(now.getTime() + 2000));

    const after = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: before.id } });
    assert.ok(after.remainingQtyBase.greaterThan(before.remainingQtyBase));

    const consLeft = await tx.inventoryBatchConsumption.count({
      where: { orderId, referenceType: "order" },
    });
    assert.equal(consLeft, 0, "cancel restore must drop order consumption rows for FIFO COGS");
  });
});

