/**
 * Insert notebook purchases + business expenses for 2026-07-27.
 * Run: npx tsx scripts/insert-purchases-expenses-2026-07-27.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const DAY = new Date("2026-07-27T12:00:00+05:30");
const SUPPLIER_NAME = "Other Supplier";

type LineSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const PURCHASE_LINES: LineSpec[] = [
  { itemName: "Ketchup", qty: "360", totalRupees: 300 },
  { itemName: "Curd", qty: "3.5", totalRupees: 250 },
  { itemName: "Milk", qty: "3", totalRupees: 150 },
  { itemName: "Full Live chicken", qty: "6.6", totalRupees: 1250 },
  { itemName: "Cabbage", qty: "4", totalRupees: 200 },
  { itemName: "Tomato", qty: "2", totalRupees: 100 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 100 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 80 },
  { itemName: "Biryani Masala", qty: "1", totalRupees: 440 },
  { itemName: "Red Chilli Powder", qty: "0.5", totalRupees: 200 },
  { itemName: "Green Olives", qty: "0.9", totalRupees: 340 },
  { itemName: "Ajina Moto", qty: "3", totalRupees: 555 },
  { itemName: "Peri Peri Masla", qty: "0.5", totalRupees: 440 },
  { itemName: "Red Peprika", qty: "0.67", totalRupees: 180 },
  { itemName: "Jalepino", qty: "0.67", totalRupees: 180 },
  { itemName: "Chili flakes Sachet", qty: "250", totalRupees: 180 },
  { itemName: "Black Olives", qty: "0.45", totalRupees: 260 },
  { itemName: "Yeast", qty: "0.5", totalRupees: 190 },
];

const EXPENSES: { categoryName: string; note: string; amountRupees: number }[] = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 120 },
  { categoryName: "Staff Food", note: "Paneer", amountRupees: 200 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 200 },
];

function ratePaise(totalRupees: number, qty: Prisma.Decimal): number {
  const totalPaise = totalRupees * 100;
  return new Prisma.Decimal(totalPaise).div(qty).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const itemNames = [...new Set(PURCHASE_LINES.map((l) => l.itemName))];
    const items = await prisma.inventoryItem.findMany({
      where: { active: true, name: { in: itemNames } },
      select: { id: true, name: true, purchaseUnit: true },
    });
    const byName = new Map(items.map((i) => [i.name, i]));
    const missing = itemNames.filter((n) => !byName.has(n));
    if (missing.length) {
      throw new Error(`Missing inventory items: ${missing.join(", ")}`);
    }

    const catNames = [...new Set(EXPENSES.map((e) => e.categoryName))];
    const cats = await prisma.expenseCategory.findMany({
      where: { active: true, name: { in: catNames } },
      select: { id: true, name: true },
    });
    const catByName = new Map(cats.map((c) => [c.name, c]));
    const missingCats = catNames.filter((n) => !catByName.has(n));
    if (missingCats.length) {
      throw new Error(`Missing expense categories: ${missingCats.join(", ")}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      let supplier = await tx.supplier.findFirst({
        where: { name: SUPPLIER_NAME, active: true },
      });
      if (!supplier) {
        supplier = await tx.supplier.create({
          data: { name: SUPPLIER_NAME },
        });
      }

      const lines = PURCHASE_LINES.map((spec) => {
        const item = byName.get(spec.itemName)!;
        const qtyPurchase = new Prisma.Decimal(spec.qty);
        return {
          inventoryItemId: item.id,
          qtyPurchase,
          ratePaisePerPurchaseUnit: ratePaise(spec.totalRupees, qtyPurchase),
          itemName: item.name,
          purchaseUnit: item.purchaseUnit,
          notebookTotalRupees: spec.totalRupees,
        };
      });

      const purchase = await createPurchaseInTransaction(tx, {
        supplierId: supplier.id,
        purchasedAt: DAY,
        paymentType: "CASH",
        notes: "Handwritten notebook 27/7 — purchases",
        lines: lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          qtyPurchase: l.qtyPurchase,
          ratePaisePerPurchaseUnit: l.ratePaisePerPurchaseUnit,
        })),
      });

      const purchaseRow = await tx.purchase.findUniqueOrThrow({
        where: { id: purchase.purchaseId },
        select: {
          id: true,
          batchRef: true,
          totalPaise: true,
          lines: {
            select: {
              lineTotalPaise: true,
              qtyPurchase: true,
              ratePaisePerPurchaseUnit: true,
              item: { select: { name: true, purchaseUnit: true } },
            },
          },
        },
      });

      const expenseRows = [];
      for (const e of EXPENSES) {
        const cat = catByName.get(e.categoryName)!;
        const row = await tx.expenseEntry.create({
          data: {
            categoryId: cat.id,
            kind: "OPERATING",
            occurredAt: DAY,
            amountPaise: e.amountRupees * 100,
            note: e.note,
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

      return { supplier, purchaseRow, expenseRows, plannedLines: lines };
    }, { timeout: 60_000 });

    console.log(
      JSON.stringify(
        {
          supplier: { id: result.supplier.id, name: result.supplier.name },
          purchase: {
            id: result.purchaseRow.id,
            batchRef: result.purchaseRow.batchRef,
            totalRupees: result.purchaseRow.totalPaise / 100,
            lines: result.purchaseRow.lines.map((l) => ({
              item: l.item.name,
              qty: String(l.qtyPurchase),
              unit: l.item.purchaseUnit,
              rateRupees: l.ratePaisePerPurchaseUnit / 100,
              lineRupees: l.lineTotalPaise / 100,
            })),
          },
          expenses: result.expenseRows.map((e) => ({
            id: e.id,
            category: e.category.name,
            note: e.note,
            amountRupees: e.amountPaise / 100,
          })),
          expenseTotalRupees: result.expenseRows.reduce((s, e) => s + e.amountPaise, 0) / 100,
          notebookPurchaseTarget: 5465,
          purchaseDiffRupees: result.purchaseRow.totalPaise / 100 - 5465,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
