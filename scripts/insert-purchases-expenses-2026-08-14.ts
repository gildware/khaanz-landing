/**
 * Insert notebook purchases, expenses, and supplier payments for 2026-08-14.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-14.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-14T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 14/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 14/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 14/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Dhaniya", qty: "0.83333333", totalRupees: 100 },
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Potato", qty: "19", totalRupees: 300 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Capsicum", qty: "1", totalRupees: 60 },
  { itemName: "Lemon", qty: "0.4375", totalRupees: 70 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 70 },
  { itemName: "Tomato", qty: "2.4", totalRupees: 60 },
  { itemName: "Butter", qty: "200", totalRupees: 1180 },
  { itemName: "Atta", qty: "10", totalRupees: 370 },
  { itemName: "Dips", qty: "2000", totalRupees: 900 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "16", totalRupees: 2650 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Phool gobi", amountRupees: 130 },
  { categoryName: "Staff Food", note: "Meat", amountRupees: 500 },
  { categoryName: "Diary", note: "Notebook diary", amountRupees: 100 },
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
        const waterSupplier = await tx.supplier.findFirst({
          where: { name: "Water Supplier", active: true },
        });
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        const tops = await tx.supplier.findFirst({
          where: { name: "Tops", active: true },
        });
        if (!otherSupplier || !tariq || !waterSupplier || !nazirGas || !tops) {
          throw new Error("A required supplier is missing");
        }

        const foundDiary = await tx.expenseCategory.findFirst({
          where: { name: "Diary", active: true },
        });
        if (!foundDiary) {
          await tx.expenseCategory.create({
            data: { name: "Diary", group: "OTHER" },
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

        const waterPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: waterSupplier.id,
          paidAt: OCCURRED_AT,
          amountPaise: 1000 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Water bill`,
        });
        const otherPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: otherSupplier.id,
          paidAt: OCCURRED_AT,
          amountPaise: 540 * 100,
          method: "cash",
          note: `${PAY_NOTE} — sabzi last balance`,
        });
        const nazirPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: nazirGas.id,
          paidAt: OCCURRED_AT,
          amountPaise: 3000 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Nazir Gas`,
        });
        const topsPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: tops.id,
          paidAt: OCCURRED_AT,
          amountPaise: 15082 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Tops`,
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
          waterPay,
          otherPay,
          nazirPay,
          topsPay,
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
              supplier: "Water Supplier",
              amountRupees: 1000,
              id: result.waterPay.paymentId,
            },
            {
              supplier: "Other Supplier",
              amountRupees: 540,
              id: result.otherPay.paymentId,
            },
            {
              supplier: "Nazir Gas",
              amountRupees: 3000,
              id: result.nazirPay.paymentId,
            },
            {
              supplier: "Tops",
              amountRupees: 15082,
              id: result.topsPay.paymentId,
            },
          ],
          skipped: [
            "sales",
            "cashbook",
            "sabzi lump 1000",
            "phool gobi inventory (staff food)",
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
