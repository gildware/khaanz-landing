/**
 * Insert notebook purchases, expenses, personal use, advance,
 * and supplier payment for 2026-08-04. Does not insert sales.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-04.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-04T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 4/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 4/8 — Tariq Chicken";
const MIRAB_NOTE = "Handwritten notebook 4/8 — Mirab Sales credit";
const WATER_NOTE = "Handwritten notebook 4/8 — Water Supplier credit";
const PAY_NOTE = "Handwritten notebook 4/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Mixed Vegetable", qty: "1", totalRupees: 410 },
  { itemName: "Curd", qty: "8", totalRupees: 480 },
  { itemName: "Milk", qty: "2.4", totalRupees: 120 },
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Water", qty: "20", totalRupees: 220 },
  { itemName: "Virgin Mojito", qty: "0.75", totalRupees: 400 },
  { itemName: "Blue Curacao", qty: "0.75", totalRupees: 400 },
  { itemName: "Fresh Cream", qty: "1.5", totalRupees: 450 },
  { itemName: "Mango Crush", qty: "1", totalRupees: 200 },
  { itemName: "Green Chilli", qty: "2", totalRupees: 100 },
  { itemName: "Water @ 20", qty: "24", totalRupees: 1000 },
  { itemName: "Milk (Tonned)", qty: "4", totalRupees: 230 },
  { itemName: "Container Big", qty: "100", totalRupees: 330 },
  { itemName: "Container Small", qty: "100", totalRupees: 230 },
  { itemName: "Dips", qty: "1000", totalRupees: 450 },
  { itemName: "Atta", qty: "10", totalRupees: 370 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "9", totalRupees: 1600 },
];

const MIRAB_LINES: PurchaseSpec[] = [
  { itemName: "Kitchen King", qty: "1", totalRupees: 660 },
  { itemName: "Black Pepper Powder", qty: "0.5", totalRupees: 750 },
  { itemName: "Garam Masala", qty: "0.5", totalRupees: 432 },
  { itemName: "Red Chilli Powder", qty: "1.5", totalRupees: 600 },
];

const WATER_CREDIT_LINES: PurchaseSpec[] = [
  { itemName: "Water @ 20", qty: "60", totalRupees: 500 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 140 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 1000 },
  { categoryName: "Surf & Soap", note: "Surf & Soap", amountRupees: 50 },
  { categoryName: "Surf & Soap", note: "Surf & Soap", amountRupees: 150 },
  { categoryName: "Cutting blade", note: "Cutting blade", amountRupees: 60 },
] as const;

const PERSONAL = [
  { note: "Farhan cash", amountRupees: 500 },
  { note: "Sugar", amountRupees: 100 },
  { note: "Tea", amountRupees: 200 },
  { note: "Roti box", amountRupees: 100 },
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
      where: {
        notes: { in: [OTHER_NOTE, TARIQ_NOTE, MIRAB_NOTE, WATER_NOTE] },
      },
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
        const mirab = await tx.supplier.findFirst({
          where: { name: "Mirab Sales", active: true },
        });
        const waterSup = await tx.supplier.findFirst({
          where: { name: "Water Supplier", active: true },
        });
        if (!otherSupplier || !tariq || !mirab || !waterSup) {
          throw new Error("A required supplier is missing");
        }

        const tasleem = await tx.employee.findFirst({
          where: { code: "KH-010", active: true },
        });
        if (!tasleem) throw new Error("Employee Tasleem (KH-010) is missing");

        const foundBlade = await tx.expenseCategory.findFirst({
          where: { name: "Cutting blade", active: true },
        });
        if (!foundBlade) {
          await tx.expenseCategory.create({
            data: { name: "Cutting blade", group: "OTHER" },
          });
        }

        const allSpecs = [
          ...OTHER_LINES,
          ...TARIQ_LINES,
          ...MIRAB_LINES,
          ...WATER_CREDIT_LINES,
        ];
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
        const mirabPurchase = await createPurchaseInTransaction(tx, {
          supplierId: mirab.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: MIRAB_NOTE,
          lines: toLines(MIRAB_LINES, itemsByName),
        });
        const waterPurchase = await createPurchaseInTransaction(tx, {
          supplierId: waterSup.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: WATER_NOTE,
          lines: toLines(WATER_CREDIT_LINES, itemsByName),
        });

        const tariqPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: tariq.id,
          paidAt: OCCURRED_AT,
          amountPaise: 1200 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Tariq payment`,
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

        const advance = await tx.employeeAdvance.create({
          data: {
            employeeId: tasleem.id,
            occurredAt: OCCURRED_AT,
            amountPaise: 150 * 100,
            method: "CASH",
            note: `${PAY_NOTE} — Tasleem from sale`,
          },
          select: { id: true, amountPaise: true },
        });

        return {
          otherPurchase,
          tariqPurchase,
          mirabPurchase,
          waterPurchase,
          tariqPay,
          expenseRows,
          personalRows,
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
            result.mirabPurchase.purchaseId,
            result.waterPurchase.purchaseId,
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
          advance: {
            employee: "Tasleem KH-010",
            amountRupees: result.advance.amountPaise / 100,
          },
          supplierPayment: {
            supplier: "Tariq Chicken",
            amountRupees: 1200,
            id: result.tariqPay.paymentId,
          },
          skipped: ["sales", "cashbook", "₹40,000 Togs"],
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
