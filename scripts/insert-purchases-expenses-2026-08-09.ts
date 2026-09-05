/**
 * Insert notebook purchases, expenses, and personal use for 2026-08-09.
 * Does not insert sales or cashbook. Faisal half-day leave already marked.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-09.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const OCCURRED_AT = new Date("2026-08-09T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 9/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 9/8 — Tariq Chicken";
const MARK_NOTE = "Handwritten notebook 9/8 — Mark Fresh credit";
const PAY_NOTE = "Handwritten notebook 9/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2.5", totalRupees: 125 },
  { itemName: "Curd", qty: "4", totalRupees: 255 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 120 },
  { itemName: "Capsicum", qty: "1", totalRupees: 80 },
  { itemName: "Carrot", qty: "1", totalRupees: 90 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 90 },
  { itemName: "Tomato", qty: "2", totalRupees: 100 },
  { itemName: "Tissue", qty: "60", totalRupees: 1070 },
  { itemName: "Pepsi @ 20", qty: "24", totalRupees: 430 },
  { itemName: "Dew @ 20", qty: "30", totalRupees: 520 },
  { itemName: "Milk (Tonned)", qty: "4", totalRupees: 230 },
  { itemName: "Red Chilli Powder", qty: "0.5", totalRupees: 210 },
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Butter Paper", qty: "200", totalRupees: 200 },
  { itemName: "Garam Masala", qty: "0.5", totalRupees: 432 },
  { itemName: "Cling Foil", qty: "3", totalRupees: 500 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "17", totalRupees: 2400 },
];

const MARK_LINES: PurchaseSpec[] = [
  { itemName: "Frozen Chicken Boneless", qty: "80", totalRupees: 28000 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 1000 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 140 },
  { categoryName: "Auto Fare", note: "Auto fare", amountRupees: 400 },
] as const;

const PERSONAL = [
  { note: "Diesel", amountRupees: 500 },
  { note: "Extra roti", amountRupees: 130 },
  { note: "Cash", amountRupees: 1000 },
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

        return {
          otherPurchase,
          tariqPurchase,
          markPurchase,
          expenseRows,
          personalRows,
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
          personal: result.personalRows.map((p) => ({
            note: p.note,
            amountRupees: p.cashAmountPaise / 100,
          })),
          personalTotalRupees:
            result.personalRows.reduce((s, p) => s + p.cashAmountPaise, 0) /
            100,
          skipped: [
            "sales",
            "cashbook",
            "cling glasses",
            "sabzi lump 350",
            "pudina/matar",
            "staff nashta",
            "staff chicken",
            "Shabbir 220",
            "Fam/Ab 25000",
            "Faisal half-day already marked",
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
