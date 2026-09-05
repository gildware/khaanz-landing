/**
 * Insert notebook purchases, expenses, and supplier payments for 2026-08-16.
 * Sabzi ₹520 booked as Mixed Vegetable lump (item list not received).
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-16.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-16T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 16/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 16/8 — Tariq Chicken";
const MARK_NOTE = "Handwritten notebook 16/8 — Mark Fresh credit";
const PAY_NOTE = "Handwritten notebook 16/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Mixed Vegetable", qty: "1", totalRupees: 520 },
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Potato", qty: "19", totalRupees: 300 },
  { itemName: "Pepsi @ 20", qty: "24", totalRupees: 400 },
  { itemName: "Tissue", qty: "62", totalRupees: 1100 },
  { itemName: "Cashew", qty: "0.5", totalRupees: 450 },
  { itemName: "Cabbage", qty: "5.68181818", totalRupees: 250 },
  { itemName: "Butter", qty: "100", totalRupees: 630 },
  { itemName: "Kit Kat", qty: "10", totalRupees: 100 },
  { itemName: "Egg", qty: "30", totalRupees: 190 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "11.48", totalRupees: 1900 },
];

const MARK_LINES: PurchaseSpec[] = [
  { itemName: "Frozen Chicken Boneless", qty: "60", totalRupees: 19260 },
  { itemName: "Frozen Fish", qty: "20", totalRupees: 5100 },
];

const EXPENSES = [
  { categoryName: "Phone recharge", note: "Shop phone recharge", amountRupees: 199 },
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Surf & Soap", note: "Soap", amountRupees: 20 },
  { categoryName: "Auto Fare", note: "Fare Srinagar", amountRupees: 400 },
  { categoryName: "Staff Food", note: "Cabbage", amountRupees: 80 },
  { categoryName: "Staff Food", note: "Meat", amountRupees: 270 },
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
      where: { notes: { in: [OTHER_NOTE, TARIQ_NOTE, MARK_NOTE] } },
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
        const markFresh = await tx.supplier.findFirst({
          where: { name: "Mark Fresh - (Chicken Fish)", active: true },
        });
        if (!otherSupplier || !tariq || !markFresh) {
          throw new Error("A required supplier is missing");
        }

        const foundPhone = await tx.expenseCategory.findFirst({
          where: { name: "Phone recharge", active: true },
        });
        if (!foundPhone) {
          await tx.expenseCategory.create({
            data: { name: "Phone recharge", group: "BILLS" },
          });
        }

        const allSpecs = [...OTHER_LINES, ...TARIQ_LINES, ...MARK_LINES];
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
        const markPurchase = await createPurchaseInTransaction(tx, {
          supplierId: markFresh.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: MARK_NOTE,
          lines: toLines(MARK_LINES, itemsByName),
        });

        const markPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: markFresh.id,
          paidAt: OCCURRED_AT,
          amountPaise: 35000 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Mark Fresh`,
        });
        const otherPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: otherSupplier.id,
          paidAt: OCCURRED_AT,
          amountPaise: 10 * 100,
          method: "cash",
          note: `${PAY_NOTE} — sabzi last balance`,
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
          markPurchase,
          markPay,
          otherPay,
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
            result.markPurchase.purchaseId,
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
              supplier: "Mark Fresh - (Chicken Fish)",
              amountRupees: 35000,
              id: result.markPay.paymentId,
            },
            {
              supplier: "Other Supplier",
              amountRupees: 10,
              id: result.otherPay.paymentId,
            },
          ],
          skipped: ["sales", "cashbook", "to bank 15000", "sabzi item list"],
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
