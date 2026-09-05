/**
 * Insert notebook purchases, expenses, and supplier payments for 2026-08-11.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-11.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-11T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 11/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 11/8 — Tariq Chicken";
const WATER_NOTE = "Handwritten notebook 11/8 — Water Supplier cash";
const NAZIR_NOTE = "Handwritten notebook 11/8 — Nazir Gas 4 cylinders credit";
const PAY_NOTE = "Handwritten notebook 11/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 120 },
  { itemName: "Methi", qty: "1", totalRupees: 80 },
  { itemName: "Paneer", qty: "0.5", totalRupees: 100 },
  { itemName: "Onion", qty: "44", totalRupees: 920 },
  { itemName: "Capsicum", qty: "1", totalRupees: 60 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Ginger", qty: "0.46666667", totalRupees: 140 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 70 },
  { itemName: "Tomato", qty: "4", totalRupees: 200 },
  { itemName: "Fresh Cream", qty: "9.38666667", totalRupees: 2816 },
  { itemName: "Chicken Patty", qty: "40", totalRupees: 900 },
  { itemName: "Veg. Patty", qty: "20", totalRupees: 350 },
  { itemName: "Burger Buns", qty: "36", totalRupees: 300 },
  { itemName: "Coffee Premix", qty: "181.82", totalRupees: 100 },
  { itemName: "Egg", qty: "30", totalRupees: 200 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "23.38", totalRupees: 3300 },
];

const WATER_LINES: PurchaseSpec[] = [
  { itemName: "Water @ 20", qty: "144", totalRupees: 1200 },
];

const NAZIR_LINES: PurchaseSpec[] = [
  { itemName: "GAS", qty: "56.4", totalRupees: 5245.2 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 140 },
  { categoryName: "Toothpick", note: "Toothpick", amountRupees: 70 },
] as const;

function ratePaise(totalRupees: number, qty: Prisma.Decimal): number {
  return new Prisma.Decimal(String(totalRupees))
    .mul(100)
    .div(qty)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

function toLines(
  specs: PurchaseSpec[],
  itemsByName: Map<string, { id: string }>,
) {
  return specs.map((spec) => {
    const item = itemsByName.get(spec.itemName)!;
    const qtyPurchase = new Prisma.Decimal(spec.qty);
    return {
      inventoryItemId: item.id,
      qtyPurchase,
      ratePaisePerPurchaseUnit: ratePaise(spec.totalRupees, qtyPurchase),
    };
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.purchase.findFirst({
      where: {
        notes: { in: [OTHER_NOTE, TARIQ_NOTE, WATER_NOTE, NAZIR_NOTE] },
      },
      select: { batchRef: true },
    });
    if (existing) {
      throw new Error(`Already inserted (found ${existing.batchRef})`);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const otherSupplier = await tx.supplier.findFirst({
          where: { name: "Other Supplier", active: true },
        });
        const tariq = await tx.supplier.findFirst({
          where: { name: "Tariq Chicken", active: true },
        });
        const waterSupplier = await tx.supplier.findFirst({
          where: { name: "Water Supplier", active: true },
        });
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        if (!otherSupplier || !tariq || !waterSupplier || !nazirGas) {
          throw new Error("A required supplier is missing");
        }

        const methi = await tx.inventoryItem.findFirst({
          where: { name: "Methi", active: true },
        });
        if (!methi) {
          await tx.inventoryItem.create({
            data: {
              name: "Methi",
              category: "Vegetables",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
          });
        }

        const paneer = await tx.inventoryItem.findFirst({
          where: { name: "Paneer", active: true },
        });
        if (!paneer) {
          await tx.inventoryItem.create({
            data: {
              name: "Paneer",
              category: "Dairy",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
          });
        }

        const foundToothpick = await tx.expenseCategory.findFirst({
          where: { name: "Toothpick", active: true },
        });
        if (!foundToothpick) {
          await tx.expenseCategory.create({
            data: { name: "Toothpick", group: "OTHER" },
          });
        }

        const allSpecs = [
          ...OTHER_LINES,
          ...TARIQ_LINES,
          ...WATER_LINES,
          ...NAZIR_LINES,
        ];
        const itemNames = [...new Set(allSpecs.map((line) => line.itemName))];
        const items = await tx.inventoryItem.findMany({
          where: { name: { in: itemNames }, active: true },
          select: { id: true, name: true },
        });
        const itemsByName = new Map(items.map((item) => [item.name, item]));
        const missingItems = itemNames.filter((name) => !itemsByName.has(name));
        if (missingItems.length > 0) {
          throw new Error(`Missing items: ${missingItems.join(", ")}`);
        }

        const otherPurchase = await createPurchaseInTransaction(tx, {
          supplierId: otherSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: OTHER_NOTE,
          lines: toLines(OTHER_LINES, itemsByName),
        });
        const tariqPurchase = await createPurchaseInTransaction(tx, {
          supplierId: tariq.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: TARIQ_NOTE,
          lines: toLines(TARIQ_LINES, itemsByName),
        });
        const waterPurchase = await createPurchaseInTransaction(tx, {
          supplierId: waterSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: WATER_NOTE,
          lines: toLines(WATER_LINES, itemsByName),
        });
        const nazirPurchase = await createPurchaseInTransaction(tx, {
          supplierId: nazirGas.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: NAZIR_NOTE,
          lines: toLines(NAZIR_LINES, itemsByName),
        });

        const waterPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: waterSupplier.id,
          paidAt: OCCURRED_AT,
          amountPaise: 1100 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Water Supplier rest of ₹2,300`,
        });

        const categoryNames = [...new Set(EXPENSES.map((e) => e.categoryName))];
        const categories = await tx.expenseCategory.findMany({
          where: { name: { in: categoryNames }, active: true },
          select: { id: true, name: true },
        });
        const categoriesByName = new Map(
          categories.map((category) => [category.name, category]),
        );
        const missingCategories = categoryNames.filter(
          (name) => !categoriesByName.has(name),
        );
        if (missingCategories.length > 0) {
          throw new Error(`Missing categories: ${missingCategories.join(", ")}`);
        }

        const expenseRows = [];
        for (const expense of EXPENSES) {
          const row = await tx.expenseEntry.create({
            data: {
              categoryId: categoriesByName.get(expense.categoryName)!.id,
              kind: "OPERATING",
              occurredAt: OCCURRED_AT,
              amountPaise: expense.amountRupees * 100,
              note: expense.note,
            },
            select: {
              id: true,
              amountPaise: true,
              note: true,
              category: { select: { name: true } },
            },
          });
          expenseRows.push(row);
        }

        return {
          otherPurchase,
          tariqPurchase,
          waterPurchase,
          nazirPurchase,
          waterPay,
          expenseRows,
        };
      },
      { timeout: 90_000 },
    );

    const purchases = await prisma.purchase.findMany({
      where: {
        id: {
          in: [
            result.otherPurchase.purchaseId,
            result.tariqPurchase.purchaseId,
            result.waterPurchase.purchaseId,
            result.nazirPurchase.purchaseId,
          ],
        },
      },
      select: {
        id: true,
        batchRef: true,
        totalPaise: true,
        paymentType: true,
        supplier: { select: { name: true } },
        lines: {
          select: {
            lineTotalPaise: true,
            qtyPurchase: true,
            item: { select: { name: true, purchaseUnit: true } },
          },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          purchases: purchases.map((purchase) => ({
            id: purchase.id,
            batchRef: purchase.batchRef,
            supplier: purchase.supplier.name,
            paymentType: purchase.paymentType,
            totalRupees: purchase.totalPaise / 100,
            lines: purchase.lines.map((line) => ({
              item: line.item.name,
              qty: String(line.qtyPurchase),
              unit: line.item.purchaseUnit,
              lineRupees: line.lineTotalPaise / 100,
            })),
          })),
          expenses: result.expenseRows.map((e) => ({
            category: e.category.name,
            note: e.note,
            amountRupees: e.amountPaise / 100,
          })),
          expenseTotalRupees:
            result.expenseRows.reduce((s, e) => s + e.amountPaise, 0) / 100,
          supplierPayments: [
            {
              supplier: "Water Supplier",
              amountRupees: 1100,
              id: result.waterPay.paymentId,
            },
          ],
          skipped: [
            "sales",
            "cashbook",
            "Adil fish",
            "sabzi lump 860",
            "cheque 10000",
            "bank 6000",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
