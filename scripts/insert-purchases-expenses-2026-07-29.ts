/**
 * Insert notebook purchases and business expenses for 2026-07-29.
 * Gas items skipped. Run: npx tsx scripts/insert-purchases-expenses-2026-07-29.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const OCCURRED_AT = new Date("2026-07-29T12:00:00+05:30");
const PURCHASE_NOTE = "Handwritten notebook 29/7 — cash purchases (gas skipped)";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalPaise: number;
};

const PURCHASE_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "3", totalPaise: 15_000 },
  { itemName: "Curd", qty: "3", totalPaise: 21_000 },
  { itemName: "Full Live chicken", qty: "7.3", totalPaise: 110_000 },
  { itemName: "Cabbage", qty: "4.5", totalPaise: 17_500 },
  { itemName: "Tomato", qty: "2", totalPaise: 10_000 },
  { itemName: "Capsicum", qty: "1", totalPaise: 7_000 },
  { itemName: "Carrot", qty: "1", totalPaise: 7_000 },
  { itemName: "Dhaniya", qty: "1", totalPaise: 8_000 },
  { itemName: "Green Chilli", qty: "1", totalPaise: 9_000 },
  { itemName: "Onion", qty: "38", totalPaise: 140_000 },
  { itemName: "Pepsi @ 20", qty: "24", totalPaise: 43_000 },
  { itemName: "Cashew", qty: "0.5", totalPaise: 50_000 },
  { itemName: "Magz", qty: "0.5", totalPaise: 38_000 },
  { itemName: "Full Live chicken", qty: "7.3", totalPaise: 115_000 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountPaise: 15_000 },
  { categoryName: "Staff Food", note: "Egg", amountPaise: 20_000 },
  { categoryName: "Photo Copy", note: "Photo Copy", amountPaise: 5_000 },
  { categoryName: "Petrol", note: "Petrol", amountPaise: 60_000 },
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
      where: { notes: PURCHASE_NOTE },
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
        if (!otherSupplier) {
          throw new Error("Other Supplier is missing");
        }

        const photoCopy = await tx.expenseCategory.findFirst({
          where: { name: "Photo Copy", active: true },
        });
        if (!photoCopy) {
          await tx.expenseCategory.create({
            data: { name: "Photo Copy", group: "OTHER" },
          });
        }

        const itemNames = [...new Set(PURCHASE_LINES.map((l) => l.itemName))];
        const items = await tx.inventoryItem.findMany({
          where: { name: { in: itemNames }, active: true },
          select: { id: true, name: true },
        });
        const itemsByName = new Map(items.map((i) => [i.name, i]));
        const missingItems = itemNames.filter((n) => !itemsByName.has(n));
        if (missingItems.length) {
          throw new Error(`Missing items: ${missingItems.join(", ")}`);
        }

        const purchase = await createPurchaseInTransaction(tx, {
          supplierId: otherSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: PURCHASE_NOTE,
          lines: PURCHASE_LINES.map((spec) => ({
            inventoryItemId: itemsByName.get(spec.itemName)!.id,
            qtyPurchase: new Prisma.Decimal(spec.qty),
            ratePaisePerPurchaseUnit: rateForTotal(spec),
          })),
        });

        const categoryNames = [...new Set(EXPENSES.map((e) => e.categoryName))];
        const categories = await tx.expenseCategory.findMany({
          where: { name: { in: categoryNames }, active: true },
          select: { id: true, name: true },
        });
        const categoriesByName = new Map(categories.map((c) => [c.name, c]));
        const missingCats = categoryNames.filter((n) => !categoriesByName.has(n));
        if (missingCats.length) {
          throw new Error(`Missing categories: ${missingCats.join(", ")}`);
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

        return { purchase };
      },
      { timeout: 60_000 },
    );

    const purchase = await prisma.purchase.findUniqueOrThrow({
      where: { id: result.purchase.purchaseId },
      select: {
        id: true,
        batchRef: true,
        totalPaise: true,
        paymentType: true,
        supplier: { select: { name: true } },
        lines: {
          select: {
            qtyPurchase: true,
            ratePaisePerPurchaseUnit: true,
            lineTotalPaise: true,
            item: { select: { name: true, purchaseUnit: true } },
          },
        },
      },
    });

    const expenses = await prisma.expenseEntry.findMany({
      where: {
        occurredAt: OCCURRED_AT,
        OR: EXPENSES.map((e) => ({
          note: e.note,
          amountPaise: e.amountPaise,
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
          purchase: {
            id: purchase.id,
            batchRef: purchase.batchRef,
            supplier: purchase.supplier.name,
            paymentType: purchase.paymentType,
            totalRupees: purchase.totalPaise / 100,
            lines: purchase.lines.map((l) => ({
              item: l.item.name,
              qty: String(l.qtyPurchase),
              unit: l.item.purchaseUnit,
              rateRupees: l.ratePaisePerPurchaseUnit / 100,
              amountRupees: l.lineTotalPaise / 100,
            })),
          },
          expenses: expenses.map((e) => ({
            category: e.category.name,
            note: e.note,
            amountRupees: e.amountPaise / 100,
          })),
          expenseTotalRupees:
            expenses.reduce((s, e) => s + e.amountPaise, 0) / 100,
          notebookPurchaseTarget: 5905,
          purchaseDiffRupees: purchase.totalPaise / 100 - 5905,
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
