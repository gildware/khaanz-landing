/**
 * Insert notebook purchases, expenses, and supplier payments for 2026-08-10.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-10.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-10T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 10/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 10/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 10/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Dhaniya", qty: "1", totalRupees: 120 },
  { itemName: "Carrot", qty: "1", totalRupees: 80 },
  { itemName: "Capsicum", qty: "1", totalRupees: 70 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 80 },
  { itemName: "Cabbage", qty: "1", totalRupees: 100 },
  { itemName: "Onion", qty: "19", totalRupees: 680 },
  { itemName: "Cabbage", qty: "2.9", totalRupees: 290 },
  { itemName: "Lemon", qty: "0.25", totalRupees: 40 },
  { itemName: "Cucumber", qty: "0.25", totalRupees: 10 },
  { itemName: "Ghiya", qty: "1", totalRupees: 70 },
  { itemName: "Capsicum", qty: "1", totalRupees: 50 },
  { itemName: "Butter", qty: "200", totalRupees: 1180 },
  { itemName: "Pepsi @ 20", qty: "48", totalRupees: 860 },
  { itemName: "Atta", qty: "10", totalRupees: 370 },
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "4.2", totalRupees: 210 },
  { itemName: "Ghee", qty: "20", totalRupees: 3100 },
  { itemName: "Water", qty: "20", totalRupees: 210 },
  { itemName: "Packing Bags (Large)", qty: "3", totalRupees: 760 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "14.17", totalRupees: 2000 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Paneer", amountRupees: 200 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 1000 },
] as const;

function ratePaise(totalRupees: number, qty: Prisma.Decimal): number {
  return new Prisma.Decimal(totalRupees * 100)
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
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        if (!otherSupplier || !tariq || !nazirGas) {
          throw new Error(
            "Other Supplier, Tariq Chicken, or Nazir Gas is missing",
          );
        }

        const ghiya = await tx.inventoryItem.findFirst({
          where: { name: "Ghiya", active: true },
        });
        if (!ghiya) {
          await tx.inventoryItem.create({
            data: {
              name: "Ghiya",
              category: "Vegetables",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
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

        const nazirPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: nazirGas.id,
          paidAt: OCCURRED_AT,
          amountPaise: 4000 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Nazir Gas`,
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
          nazirPay,
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
              supplier: "Nazir Gas",
              amountRupees: 4000,
              id: result.nazirPay.paymentId,
            },
          ],
          skipped: [
            "sales",
            "cashbook",
            "Modern 4655",
            "Kadoo 13940",
            "Shabir unpaid 2220",
            "HDFC 7000",
            "Methi crossed out",
            "Sabzi L-Carsonwala lump 1500",
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
