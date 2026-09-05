/**
 * Insert notebook purchases, expenses, and advance for 2026-08-15.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-15.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const OCCURRED_AT = new Date("2026-08-15T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 15/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 15/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 15/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "4.4", totalRupees: 220 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 120 },
  { itemName: "Green Chilli", qty: "1.14285714", totalRupees: 80 },
  { itemName: "Thousand Island Dressing", qty: "12", totalRupees: 2880 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "9.06", totalRupees: 1500 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 800 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 200 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Wifi", note: "Restaurant wifi", amountRupees: 589 },
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
      where: { notes: { in: [OTHER_NOTE, TARIQ_NOTE] } },
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
        if (!otherSupplier || !tariq) {
          throw new Error("Other Supplier or Tariq Chicken is missing");
        }

        const ebran = await tx.employee.findFirst({
          where: { code: "KH-006", active: true },
        });
        if (!ebran) {
          throw new Error("Ebran KH-006 is missing");
        }

        const dressing = await tx.inventoryItem.findFirst({
          where: { name: "Thousand Island Dressing", active: true },
        });
        if (!dressing) {
          await tx.inventoryItem.create({
            data: {
              name: "Thousand Island Dressing",
              category: "Sauces",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
          });
        }

        const foundWifi = await tx.expenseCategory.findFirst({
          where: { name: "Wifi", active: true },
        });
        if (!foundWifi) {
          await tx.expenseCategory.create({
            data: { name: "Wifi", group: "BILLS" },
          });
        }

        const allSpecs = [...OTHER_LINES, ...TARIQ_LINES];
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

        const advance = await tx.employeeAdvance.create({
          data: {
            employeeId: ebran.id,
            occurredAt: OCCURRED_AT,
            amountPaise: 100 * 100,
            method: "CASH",
            note: `${PAY_NOTE} — Ebran KH-006`,
          },
          select: { id: true, amountPaise: true, note: true },
        });

        return {
          otherPurchase,
          tariqPurchase,
          expenseRows,
          advance,
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
          advance: {
            note: result.advance.note,
            amountRupees: result.advance.amountPaise / 100,
          },
          skipped: ["sales", "cashbook", "missing 1006"],
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
