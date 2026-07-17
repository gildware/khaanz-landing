import test from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import { applyOrderInventoryRestore } from "@/lib/inventory/apply-order-inventory";
import { consumeFromBatchesFifo } from "@/lib/inventory/batch-ops";
import { d } from "@/lib/inventory/decimal-utils";
import { computeDishCostBreakdown } from "@/lib/inventory/dish-cost";
import {
  onHandValueFifoPaise,
  peekFifoConsumptionCost,
} from "@/lib/inventory/inventory-costing";
import { sumOrderConsumptionCostPaise } from "@/lib/inventory/fifo-cogs";
import { createPurchaseInTransaction } from "@/lib/inventory/purchase-flow";
import {
  recordKitchenUse,
  recordOpeningStock,
  recordStockSale,
  recordWastage,
} from "@/lib/inventory/stock-ops";
import { getPrisma } from "@/lib/prisma";

function rand(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function setCostingMethod(
  tx: Prisma.TransactionClient,
  method: "FIFO" | "WEIGHTED_AVERAGE" | "LATEST_PURCHASE",
) {
  await tx.inventorySettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      costingMethod: method,
      restoreStockOnCancel: true,
      allowNegativeStock: true,
    },
    update: { costingMethod: method },
  });
}

/** Three layers: 10kg@₹10, 5kg@₹20, 10kg@₹30 → 1 / 2 / 3 paise per gram. */
async function seedXyzLayers(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<{ itemId: string; supplierId: string }> {
  const supplier = await tx.supplier.create({
    data: { name: rand("Supplier"), active: true, defaultCreditDays: 15 },
  });
  const item = await tx.inventoryItem.create({
    data: {
      name: rand("Flour"),
      category: "Dry",
      baseUnit: "g",
      purchaseUnit: "kg",
      baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
      minStockBase: new Prisma.Decimal("0"),
      active: true,
    },
  });

  const buys: { qty: string; rate: number; at: number; lot: string }[] = [
    { qty: "10", rate: 1000, at: 1000, lot: "X" },
    { qty: "5", rate: 2000, at: 2000, lot: "Y" },
    { qty: "10", rate: 3000, at: 3000, lot: "Z" },
  ];

  for (const b of buys) {
    await createPurchaseInTransaction(tx, {
      supplierId: supplier.id,
      purchasedAt: new Date(now.getTime() + b.at),
      paymentType: "CASH",
      creditDays: null,
      notes: b.lot,
      createdByUserId: null,
      lines: [
        {
          inventoryItemId: item.id,
          qtyPurchase: d(b.qty),
          ratePaisePerPurchaseUnit: b.rate,
          expiryDate: null,
          lotCode: b.lot,
        },
      ],
    });
  }

  return { itemId: item.id, supplierId: supplier.id };
}

async function cleanupFifoFixtures() {
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

test("fifo setup: clean fixtures", async () => {
  await cleanupFifoFixtures();
  assert.ok(true);
});

test("FIFO: purchase layers store unit costs X=1, Y=2, Z=3 paise/g", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const batches = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    assert.equal(batches.length, 3);
    assert.equal(Number(batches[0]!.unitCostPaisePerBase), 1);
    assert.equal(Number(batches[1]!.unitCostPaisePerBase), 2);
    assert.equal(Number(batches[2]!.unitCostPaisePerBase), 3);
    assert.equal(Number(batches[0]!.remainingQtyBase), 10000);
    assert.equal(Number(batches[1]!.remainingQtyBase), 5000);
    assert.equal(Number(batches[2]!.remainingQtyBase), 10000);
  });
});

test("FIFO: consume finishes layer X then Y (12kg → 10@X + 2@Y)", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const allocations = await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      occurredAt: new Date(now.getTime() + 5000),
      referenceType: "order",
      referenceId: "cogs-12kg",
      allowNegative: false,
    });

    assert.equal(allocations.length, 2);
    assert.equal(allocations[0]!.costPaise, 10_000); // 10000g × 1
    assert.equal(allocations[1]!.costPaise, 4_000); // 2000g × 2
    assert.equal(
      allocations.reduce((s, a) => s + a.costPaise, 0),
      14_000,
    );

    const remaining = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    assert.equal(Number(remaining[0]!.remainingQtyBase), 0);
    assert.equal(Number(remaining[1]!.remainingQtyBase), 3000);
    assert.equal(Number(remaining[2]!.remainingQtyBase), 10000);
  });
});

test("FIFO: sequential uses — first 10kg at X, next 5kg at Y, next 10kg at Z", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const a1 = await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("10000"),
      occurredAt: new Date(now.getTime() + 5000),
      referenceType: "wastage",
      referenceId: "u1",
      allowNegative: false,
    });
    assert.equal(
      a1.reduce((s, a) => s + a.costPaise, 0),
      10_000,
    );

    const a2 = await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("5000"),
      occurredAt: new Date(now.getTime() + 6000),
      referenceType: "wastage",
      referenceId: "u2",
      allowNegative: false,
    });
    assert.equal(
      a2.reduce((s, a) => s + a.costPaise, 0),
      10_000,
    ); // 5000 × 2

    const a3 = await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("10000"),
      occurredAt: new Date(now.getTime() + 7000),
      referenceType: "wastage",
      referenceId: "u3",
      allowNegative: false,
    });
    assert.equal(
      a3.reduce((s, a) => s + a.costPaise, 0),
      30_000,
    ); // 10000 × 3
  });
});

test("FIFO: peekFifoConsumptionCost matches consume without mutating stock", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const peeked = await peekFifoConsumptionCost(tx, itemId, d("12000"));
    assert.equal(Number(peeked.toString()), 14_000);

    const before = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });

    const peekedAgain = await peekFifoConsumptionCost(tx, itemId, d("12000"));
    assert.equal(Number(peekedAgain.toString()), 14_000);

    const after = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    for (let i = 0; i < before.length; i++) {
      assert.equal(
        after[i]!.remainingQtyBase.toString(),
        before[i]!.remainingQtyBase.toString(),
      );
    }
  });
});

test("FIFO: on-hand value = remaining layers after partial consume", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    // Full pile: 10000×1 + 5000×2 + 10000×3 = 10000+10000+30000 = 50000
    assert.equal(await onHandValueFifoPaise(tx, itemId), 50_000);

    await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      occurredAt: new Date(now.getTime() + 5000),
      referenceType: "order",
      referenceId: "partial",
      allowNegative: false,
    });

    // Left: 3000×2 + 10000×3 = 6000 + 30000 = 36000
    assert.equal(await onHandValueFifoPaise(tx, itemId), 36_000);
  });
});

test("FIFO: kitchen use COGS uses layer rates; weighted average uses blended", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const fifoUse = await recordKitchenUse(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      usedAt: new Date(now.getTime() + 5000),
      note: "fifo kitchen",
      allowNegativeStock: false,
    });
    assert.equal(fifoUse.costPaise, 14_000);

    // Fresh item for average path
    const { itemId: item2 } = await seedXyzLayers(tx, new Date(now.getTime() + 10_000));
    await setCostingMethod(tx, "WEIGHTED_AVERAGE");
    const itemRow = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item2 } });
    const avgRate = Number(itemRow.avgCostPaisePerBase.toString());
    // Blended: (10000*1 + 5000*2 + 10000*3) / 25000 = 50000/25000 = 2
    assert.ok(Math.abs(avgRate - 2) < 0.0001);

    const avgUse = await recordKitchenUse(tx, {
      inventoryItemId: item2,
      qtyBase: d("12000"),
      usedAt: new Date(now.getTime() + 20_000),
      note: "avg kitchen",
      allowNegativeStock: false,
    });
    assert.equal(avgUse.costPaise, Math.round(12_000 * avgRate));
    assert.equal(avgUse.costPaise, 24_000);
    assert.notEqual(avgUse.costPaise, fifoUse.costPaise);
  });
});

test("FIFO: stock sale COGS uses oldest layers", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const sale = await recordStockSale(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      ratePaisePerBase: d("5"),
      soldAt: new Date(now.getTime() + 5000),
      buyerName: "Vendor",
      allowNegativeStock: false,
    });

    assert.equal(sale.costPaise, 14_000);
    assert.equal(sale.totalPaise, 60_000); // 12000 × 5
  });
});

test("FIFO: wastage consumptions snapshot layer cost", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const { id } = await recordWastage(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      wastedAt: new Date(now.getTime() + 5000),
      wastageType: "SPOILAGE",
      allowNegativeStock: false,
    });

    const cons = await tx.inventoryBatchConsumption.findMany({
      where: { referenceType: "wastage", referenceId: id },
    });
    assert.equal(
      cons.reduce((s, c) => s + c.costPaise, 0),
      14_000,
    );
  });
});

test("FIFO: dish cost preview peeks next layers for recipe qty", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const catId = rand("cat");
    const menuItemId = rand("mi");
    const variationId = rand("var");

    await tx.category.create({
      data: { id: catId, name: rand("Cat"), sortOrder: 0 },
    });
    await tx.menuItem.create({
      data: {
        id: menuItemId,
        categoryId: catId,
        name: rand("Roti"),
        available: true,
        sortOrder: 0,
      },
    });
    await tx.menuItemVariation.create({
      data: {
        id: variationId,
        itemId: menuItemId,
        name: "Regular",
        price: 40,
        sortOrder: 0,
      },
    });
    await tx.recipeVersion.create({
      data: {
        menuItemId,
        variationId,
        effectiveFrom: now,
        label: "v1",
        ingredients: {
          create: [{ inventoryItemId: itemId, qtyBase: d("12000") }],
        },
      },
    });

    const breakdown = await computeDishCostBreakdown(
      tx,
      menuItemId,
      variationId,
      new Date(now.getTime() + 10_000),
    );
    assert.ok(breakdown);
    assert.equal(Number(breakdown!.costPaise.toString()), 14_000);

    // Stock unchanged after peek-based dish cost
    assert.equal(await onHandValueFifoPaise(tx, itemId), 50_000);
  });
});

test("FIFO: opening stock with rate stamps batch unit cost", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const item = await tx.inventoryItem.create({
      data: {
        name: rand("Sugar"),
        category: "Dry",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
        minStockBase: new Prisma.Decimal("0"),
        active: true,
      },
    });

    // ₹50/kg → 5000 paise/kg → 5 paise/g
    await recordOpeningStock(tx, {
      inventoryItemId: item.id,
      qtyBase: d("2000"),
      occurredAt: now,
      ratePaisePerPurchaseUnit: 5000,
      note: "opening",
    });

    const batch = await tx.inventoryBatch.findFirstOrThrow({
      where: { inventoryItemId: item.id, sourceType: "OPENING_STOCK" },
    });
    assert.equal(Number(batch.unitCostPaisePerBase), 5);

    const alloc = await consumeFromBatchesFifo(tx, {
      inventoryItemId: item.id,
      qtyBase: d("500"),
      occurredAt: new Date(now.getTime() + 1000),
      referenceType: "order",
      referenceId: "open-cost",
      allowNegative: false,
    });
    assert.equal(alloc[0]!.costPaise, 2500); // 500 × 5
  });
});

test("FIFO: cancel restore puts qty back and deletes consumption COGS rows", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const customer = await tx.customer.create({
      data: { phoneDigits: `9${Date.now().toString().slice(-9)}` },
    });
    const orderId = crypto.randomUUID();
    await tx.order.create({
      data: {
        id: orderId,
        customerId: customer.id,
        status: "PENDING",
        fulfillment: "pickup",
        scheduleMode: "asap",
        totalMinor: 100,
        currency: "INR",
        source: "pos",
        paymentMethod: "cash",
        dineInTable: "",
        inventoryDeductedAt: now,
        lines: {
          create: [{ sortIndex: 0, payload: { type: "open", name: "x" } }],
        },
      },
    });

    // Also bump stockOnHand to match batches (purchases already did)
    await consumeFromBatchesFifo(tx, {
      inventoryItemId: itemId,
      qtyBase: d("12000"),
      occurredAt: new Date(now.getTime() + 1000),
      referenceType: "order",
      referenceId: orderId,
      orderId,
      allowNegative: false,
    });

    // Mirror stockOnHand deduction that order flow would do
    const itemBefore = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { stockOnHandBase: itemBefore.stockOnHandBase.sub(d("12000")) },
    });

    const cogsBefore = await sumOrderConsumptionCostPaise(tx, [orderId]);
    assert.equal(cogsBefore, 14_000);

    await applyOrderInventoryRestore(
      tx,
      orderId,
      { lines: [] },
      null,
      new Date(now.getTime() + 2000),
    );

    const consLeft = await tx.inventoryBatchConsumption.count({
      where: { orderId, referenceType: "order" },
    });
    assert.equal(consLeft, 0);

    const cogsAfter = await sumOrderConsumptionCostPaise(tx, [orderId]);
    assert.equal(cogsAfter, 0);

    assert.equal(await onHandValueFifoPaise(tx, itemId), 50_000);
  });
});

test("FIFO: sumOrderConsumptionCostPaise falls back to avg when costPaise is 0", async () => {
  const prisma = getPrisma();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await setCostingMethod(tx, "FIFO");
    const { itemId } = await seedXyzLayers(tx, now);

    const customer = await tx.customer.create({
      data: { phoneDigits: `8${Date.now().toString().slice(-9)}` },
    });
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
        lines: {
          create: [{ sortIndex: 0, payload: { type: "open", name: "x" } }],
        },
      },
    });

    const batch = await tx.inventoryBatch.findFirstOrThrow({
      where: { inventoryItemId: itemId },
      orderBy: { receivedAt: "asc" },
    });

    // Legacy-style row with costPaise=0
    await tx.inventoryBatchConsumption.create({
      data: {
        batchId: batch.id,
        inventoryItemId: itemId,
        orderId,
        referenceType: "order",
        referenceId: orderId,
        occurredAt: now,
        qtyBase: d("1000"),
        costPaise: 0,
      },
    });

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { avgCostPaisePerBase: d("7") },
    });

    const cost = await sumOrderConsumptionCostPaise(tx, [orderId]);
    assert.equal(cost, 7000); // 1000 × 7 fallback
  });
});

test("fifo teardown: restore default costing method", async () => {
  const prisma = getPrisma();
  await prisma.inventorySettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      costingMethod: "WEIGHTED_AVERAGE",
      restoreStockOnCancel: true,
      allowNegativeStock: true,
    },
    update: { costingMethod: "WEIGHTED_AVERAGE" },
  });
  assert.ok(true);
});
