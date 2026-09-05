/**
 * Insert notebook purchases, expenses, and supplier payments for 2026-08-07.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-07.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-07T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 7/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 7/8 — Tariq Chicken";
const NAZIR_NOTE = "Handwritten notebook 7/8 — Nazir Gas 5 cylinders credit";
const PAY_NOTE = "Handwritten notebook 7/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "2.4", totalRupees: 120 },
  { itemName: "Dhaniya", qty: "0.41666667", totalRupees: 100 },
  { itemName: "Garlic", qty: "2.22222222", totalRupees: 100 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Tomato", qty: "2", totalRupees: 100 },
  { itemName: "Green Chilli", qty: "2", totalRupees: 100 },
  { itemName: "Tissue", qty: "20", totalRupees: 340 },
  { itemName: "Cling Foil", qty: "1", totalRupees: 180 },
  { itemName: "Packing Bags (Large)", qty: "1", totalRupees: 260 },
  { itemName: "Food Grade Bags", qty: "1", totalRupees: 150 },
  { itemName: "Packing Bags (Large)", qty: "0.5", totalRupees: 130 },
  { itemName: "Ajina Moto", qty: "25", totalRupees: 4350 },
  { itemName: "Corn Flour", qty: "25", totalRupees: 1550 },
  { itemName: "Meat Masala", qty: "6", totalRupees: 4870 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "8", totalRupees: 1300 },
  { itemName: "Full Live chicken", qty: "9", totalRupees: 1250 },
];

const NAZIR_LINES: PurchaseSpec[] = [
  { itemName: "GAS", qty: "70.5", totalRupees: 6556.5 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 120 },
  { categoryName: "Staff meds", note: "Staff meds", amountRupees: 40 },
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
      where: { notes: { in: [OTHER_NOTE, TARIQ_NOTE, NAZIR_NOTE] } },
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
        const markFresh = await tx.supplier.findFirst({
          where: { name: "Mark Fresh - (Chicken Fish)", active: true },
        });
        if (!otherSupplier || !tariq || !nazirGas || !markFresh) {
          throw new Error("A required supplier is missing");
        }

        const foundMeds = await tx.expenseCategory.findFirst({
          where: { name: "Staff meds", active: true },
        });
        if (!foundMeds) {
          await tx.expenseCategory.create({
            data: { name: "Staff meds", group: "OTHER" },
          });
        }

        const allSpecs = [...OTHER_LINES, ...TARIQ_LINES, ...NAZIR_LINES];
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
        const nazirPurchase = await createPurchaseInTransaction(tx, {
          supplierId: nazirGas.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: NAZIR_NOTE,
          lines: toLines(NAZIR_LINES, itemsByName),
        });

        const nazirPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: nazirGas.id,
          paidAt: OCCURRED_AT,
          amountPaise: 2750 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Nazir Gas`,
        });
        const markPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: markFresh.id,
          paidAt: OCCURRED_AT,
          amountPaise: 30000 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Mark Fresh`,
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
          nazirPurchase,
          nazirPay,
          markPay,
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
              supplier: "Nazir Gas",
              amountRupees: 2750,
              id: result.nazirPay.paymentId,
            },
            {
              supplier: "Mark Fresh - (Chicken Fish)",
              amountRupees: 30000,
              id: result.markPay.paymentId,
            },
          ],
          skipped: ["sales", "cashbook", "sabzi lump 450 (used veg list ₹470)"],
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
