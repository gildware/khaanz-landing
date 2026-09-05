/**
 * Insert notebook purchases, expenses, advances, and supplier payment
 * for 2026-08-17. Does not insert sales, cashbook, salary run, or attendance.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-17.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-17T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 17/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 17/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 17/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "3", totalRupees: 300 },
  { itemName: "Butter", qty: "200", totalRupees: 1250 },
  { itemName: "Packing Bags (Large)", qty: "3.9", totalRupees: 1000 },
  { itemName: "Tea Glasses", qty: "10", totalRupees: 50 },
  { itemName: "Oil", qty: "1", totalRupees: 190 },
  { itemName: "Tomato", qty: "2", totalRupees: 50 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 120 },
  { itemName: "Capsicum", qty: "1.16666667", totalRupees: 70 },
  { itemName: "Green Chilli", qty: "1.14285714", totalRupees: 80 },
  { itemName: "Capsicum", qty: "1", totalRupees: 60 },
  { itemName: "Carrot", qty: "1.42857143", totalRupees: 100 },
  { itemName: "Lemon", qty: "0.5", totalRupees: 80 },
  { itemName: "Ginger", qty: "0.46666667", totalRupees: 140 },
  { itemName: "Cabbage", qty: "10.90909091", totalRupees: 480 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 70 },
  { itemName: "Dhaniya", qty: "0.5", totalRupees: 60 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "13.4", totalRupees: 1900 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 450 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Hit spray", note: "Hit spray", amountRupees: 100 },
  { categoryName: "Surf & Soap", note: "Soap", amountRupees: 130 },
  { categoryName: "Auto Fare", note: "Auto fare", amountRupees: 100 },
  { categoryName: "Staff Food", note: "Paneer", amountRupees: 220 },
  { categoryName: "Surf & Soap", note: "Soap", amountRupees: 50 },
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
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        if (!otherSupplier || !tariq || !nazirGas) {
          throw new Error(
            "Other Supplier, Tariq Chicken, or Nazir Gas is missing",
          );
        }

        const akbar = await tx.employee.findFirst({
          where: { code: "KH-003", active: true },
        });
        const anwarul = await tx.employee.findFirst({
          where: { code: "KH-004", active: true },
        });
        const tasleem = await tx.employee.findFirst({
          where: { code: "KH-010", active: true },
        });
        if (!akbar || !anwarul || !tasleem) {
          throw new Error(
            "Akbar KH-003, Anwarul KH-004, or Tasleem KH-010 is missing",
          );
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
          amountPaise: 2000 * 100,
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

        const advances = [];
        for (const a of [
          {
            employee: akbar,
            amountRupees: 2000,
            method: "CASH" as const,
            note: "Akbar KH-003",
          },
          {
            employee: tasleem,
            amountRupees: 150,
            method: "CASH" as const,
            note: "Tasleem KH-010",
          },
          {
            employee: anwarul,
            amountRupees: 3000,
            method: "OTHER" as const,
            note: "Anwarul KH-004 M-Pay (notebook dated Aug-16)",
          },
        ]) {
          const row = await tx.employeeAdvance.create({
            data: {
              employeeId: a.employee.id,
              occurredAt: OCCURRED_AT,
              amountPaise: a.amountRupees * 100,
              method: a.method,
              note: `${PAY_NOTE} — ${a.note}`,
            },
            select: { id: true, amountPaise: true, note: true, method: true },
          });
          advances.push(row);
        }

        return {
          otherPurchase,
          tariqPurchase,
          nazirPay,
          expenseRows,
          advances,
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
              amountRupees: 2000,
              id: result.nazirPay.paymentId,
            },
          ],
          advances: result.advances.map((a) => ({
            note: a.note,
            method: a.method,
            amountRupees: a.amountPaise / 100,
          })),
          skipped: [
            "sales",
            "cashbook",
            "cheques 20000",
            "salary 5150",
            "self 520",
            "Farhan 125",
            "nam 300",
            "Mustaq order list",
            "Faizan/Farhan holiday",
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
