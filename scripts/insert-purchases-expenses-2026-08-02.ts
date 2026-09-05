/**
 * Insert notebook purchases, expenses, personal use, and supplier
 * payment for 2026-08-02. Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-02.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-02T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 2/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 2/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 2/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "6", totalRupees: 300 },
  { itemName: "Cucumber", qty: "2.5", totalRupees: 100 },
  { itemName: "Tomato", qty: "1", totalRupees: 60 },
  { itemName: "Carrot", qty: "1", totalRupees: 80 },
  { itemName: "Capsicum", qty: "0.5", totalRupees: 40 },
  { itemName: "Dhaniya", qty: "0.5", totalRupees: 120 },
  { itemName: "Green Chilli", qty: "2", totalRupees: 100 },
  { itemName: "Tissue", qty: "20", totalRupees: 300 },
  { itemName: "Capsicum", qty: "4", totalRupees: 160 },
  { itemName: "Lemon", qty: "0.25", totalRupees: 80 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "11.25", totalRupees: 1800 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Staff Food", note: "Chicken", amountRupees: 500 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 1000 },
] as const;

const PERSONAL = [
  { note: "Surf", amountRupees: 120 },
  { note: "Roti", amountRupees: 120 },
  { note: "Eggs", amountRupees: 200 },
  { note: "Farhan cash", amountRupees: 300 },
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
      select: { batchRef: true, notes: true },
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

        const itemNames = [
          ...new Set(
            [...OTHER_LINES, ...TARIQ_LINES].map((line) => line.itemName),
          ),
        ];
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

        const personalRows = [];
        for (const p of PERSONAL) {
          const row = await tx.personalUseEntry.create({
            data: {
              kind: "CASH",
              occurredAt: OCCURRED_AT,
              cashAmountPaise: p.amountRupees * 100,
              note: `${PAY_NOTE} — ${p.note}`,
            },
            select: { id: true, cashAmountPaise: true, note: true },
          });
          personalRows.push(row);
        }

        const tariqPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: tariq.id,
          paidAt: OCCURRED_AT,
          amountPaise: 425 * 100,
          method: "cash",
          note: `${PAY_NOTE} — last balance`,
        });

        return {
          otherPurchase,
          tariqPurchase,
          expenseRows,
          personalRows,
          tariqPay,
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
        notes: true,
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
          personal: result.personalRows.map((p) => ({
            note: p.note,
            amountRupees: p.cashAmountPaise / 100,
          })),
          personalTotalRupees:
            result.personalRows.reduce((s, p) => s + p.cashAmountPaise, 0) /
            100,
          supplierPayment: {
            supplier: "Tariq Chicken",
            amountRupees: 425,
            id: result.tariqPay.paymentId,
          },
          skipped: ["sales (POS already has 2 Aug)", "cashbook"],
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
