/**
 * Insert notebook purchases and business expenses for 2026-07-28.
 * Run: npx tsx scripts/insert-purchases-expenses-2026-07-28.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const OCCURRED_AT = new Date("2026-07-28T12:00:00+05:30");
const CASH_NOTE = "Handwritten notebook 28/7 — cash purchases";
const CREDIT_NOTE = "Handwritten notebook 28/7 — Tops credit purchases";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalPaise: number;
};

const CASH_LINES: PurchaseSpec[] = [
  { itemName: "Curd", qty: "2.85", totalPaise: 20_000 },
  { itemName: "Milk", qty: "3", totalPaise: 15_000 },
  { itemName: "Cabbage", qty: "2.42", totalPaise: 17_000 },
  { itemName: "Tomato", qty: "2", totalPaise: 10_000 },
  { itemName: "Green Chilli", qty: "1.25", totalPaise: 10_000 },
  { itemName: "Dhaniya", qty: "1", totalPaise: 10_000 },
  { itemName: "Ginger", qty: "1", totalPaise: 15_000 },
  { itemName: "Carrot", qty: "1", totalPaise: 8_000 },
  { itemName: "Dips", qty: "1000", totalPaise: 90_000 },
  { itemName: "Kalonji", qty: "0.03", totalPaise: 5_000 },
  { itemName: "Packing Bags (Medium)", qty: "2", totalPaise: 50_000 },
  { itemName: "Egg", qty: "30", totalPaise: 20_000 },
  { itemName: "Burger Buns", qty: "36", totalPaise: 30_000 },
  { itemName: "Container Big", qty: "100", totalPaise: 33_000 },
  { itemName: "Tissue", qty: "15", totalPaise: 30_000 },
  { itemName: "Cling Foil", qty: "1", totalPaise: 20_000 },
];

const CREDIT_LINES: PurchaseSpec[] = [
  { itemName: "Noodles", qty: "11.70", totalPaise: 122_400 },
  { itemName: "Ketchup", qty: "1296", totalPaise: 83_000 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountPaise: 15_000 },
  { categoryName: "Staff Food", note: "Veg", amountPaise: 10_000 },
  { categoryName: "Staff Food", note: "Veg", amountPaise: 20_000 },
  { categoryName: "Petrol", note: "Petrol", amountPaise: 100_000 },
  { categoryName: "Notepad", note: "Notepad", amountPaise: 20_000 },
  { categoryName: "Broom", note: "Broom", amountPaise: 18_000 },
  {
    categoryName: "Electricity Bill",
    note: "Electricity bill",
    amountPaise: 300_000,
  },
] as const;

function rateForTotal(spec: PurchaseSpec): number {
  return new Prisma.Decimal(spec.totalPaise)
    .div(spec.qty)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.purchase.findFirst({
      where: { notes: { in: [CASH_NOTE, CREDIT_NOTE] } },
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
        const topsSupplier = await tx.supplier.findFirst({
          where: { name: "Tops", active: true },
        });
        if (!otherSupplier || !topsSupplier) {
          throw new Error("Other Supplier or Tops is missing");
        }

        const itemDefaults = [
          {
            name: "Ginger",
            category: "Vegetables",
            baseUnit: "g",
            purchaseUnit: "kg",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
          },
          {
            name: "Cling Foil",
            category: "Disposable",
            baseUnit: "pc",
            purchaseUnit: "roll",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal(1),
          },
        ];
        for (const item of itemDefaults) {
          const found = await tx.inventoryItem.findFirst({
            where: { name: item.name, active: true },
          });
          if (!found) await tx.inventoryItem.create({ data: item });
        }

        for (const name of ["Notepad", "Broom"]) {
          const found = await tx.expenseCategory.findFirst({
            where: { name, active: true },
          });
          if (!found) {
            await tx.expenseCategory.create({
              data: { name, group: "OTHER" },
            });
          }
        }

        const allSpecs = [...CASH_LINES, ...CREDIT_LINES];
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

        const toPurchaseLines = (specs: PurchaseSpec[]) =>
          specs.map((spec) => ({
            inventoryItemId: itemsByName.get(spec.itemName)!.id,
            qtyPurchase: new Prisma.Decimal(spec.qty),
            ratePaisePerPurchaseUnit: rateForTotal(spec),
          }));

        const cashPurchase = await createPurchaseInTransaction(tx, {
          supplierId: otherSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: CASH_NOTE,
          lines: toPurchaseLines(CASH_LINES),
        });
        const creditPurchase = await createPurchaseInTransaction(tx, {
          supplierId: topsSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: CREDIT_NOTE,
          lines: toPurchaseLines(CREDIT_LINES),
        });

        const categoryNames = [
          ...new Set(EXPENSES.map((expense) => expense.categoryName)),
        ];
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

        for (const expense of EXPENSES) {
          await tx.expenseEntry.create({
            data: {
              categoryId: categoriesByName.get(expense.categoryName)!.id,
              kind: "OPERATING",
              occurredAt: OCCURRED_AT,
              amountPaise: expense.amountPaise,
              note: expense.note,
            },
          });
        }

        return { cashPurchase, creditPurchase };
      },
      { timeout: 60_000 },
    );

    const purchases = await prisma.purchase.findMany({
      where: {
        id: {
          in: [result.cashPurchase.purchaseId, result.creditPurchase.purchaseId],
        },
      },
      orderBy: { paymentType: "asc" },
      select: {
        id: true,
        batchRef: true,
        totalPaise: true,
        paymentType: true,
        supplier: { select: { name: true } },
        lines: {
          select: {
            lineTotalPaise: true,
            item: { select: { name: true } },
          },
        },
      },
    });
    const expenses = await prisma.expenseEntry.findMany({
      where: {
        occurredAt: OCCURRED_AT,
        OR: EXPENSES.map((expense) => ({
          note: expense.note,
          amountPaise: expense.amountPaise,
        })),
      },
      select: {
        amountPaise: true,
        note: true,
        category: { select: { name: true } },
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
              amountRupees: line.lineTotalPaise / 100,
            })),
          })),
          expenses: expenses.map((expense) => ({
            category: expense.category.name,
            note: expense.note,
            amountRupees: expense.amountPaise / 100,
          })),
          expenseTotalRupees:
            expenses.reduce((sum, expense) => sum + expense.amountPaise, 0) /
            100,
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
