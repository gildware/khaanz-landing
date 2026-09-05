/**
 * Insert notebook purchases, expenses, advances, and supplier payments
 * for 2026-08-13. Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-13.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-13T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 13/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 13/8 — Tariq Chicken";
const WATER_NOTE = "Handwritten notebook 13/8 — Water Supplier 5 cases credit";
const PG_NOTE = "Handwritten notebook 13/8 — Pg Chicken fish credit";
const PAY_NOTE = "Handwritten notebook 13/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Dhaniya", qty: "0.83333333", totalRupees: 100 },
  { itemName: "Pepsi @ 20", qty: "48", totalRupees: 860 },
  { itemName: "Dew @ 20", qty: "30", totalRupees: 520 },
  { itemName: "Carrot", qty: "1.42857143", totalRupees: 100 },
  { itemName: "Capsicum", qty: "1.5", totalRupees: 90 },
  { itemName: "Ginger", qty: "0.46666667", totalRupees: 140 },
  { itemName: "Tomato", qty: "6", totalRupees: 150 },
  { itemName: "Cabbage", qty: "4.31818182", totalRupees: 190 },
  { itemName: "Apple", qty: "1", totalRupees: 100 },
  { itemName: "Potato", qty: "15", totalRupees: 180 },
  { itemName: "Turmeric", qty: "0.5", totalRupees: 200 },
  { itemName: "Plain Rice", qty: "2", totalRupees: 80 },
  { itemName: "Milk (Tonned)", qty: "16.43478261", totalRupees: 945 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "11.51", totalRupees: 1650 },
];

const WATER_LINES: PurchaseSpec[] = [
  { itemName: "Water @ 20", qty: "60", totalRupees: 500 },
];

const PG_LINES: PurchaseSpec[] = [
  { itemName: "Fish", qty: "10", totalRupees: 2800 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Hit spray", note: "Hit spray", amountRupees: 90 },
  { categoryName: "Surf & Soap", note: "Surf 2 kg", amountRupees: 220 },
  { categoryName: "Utensils", note: "Karchi", amountRupees: 500 },
  { categoryName: "Handwash", note: "Handwash", amountRupees: 310 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 700 },
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
      where: {
        notes: { in: [OTHER_NOTE, TARIQ_NOTE, WATER_NOTE, PG_NOTE] },
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
        const waterSupplier = await tx.supplier.findFirst({
          where: { name: "Water Supplier", active: true },
        });
        const pgChicken = await tx.supplier.findFirst({
          where: { name: "Pg Chicken", active: true },
        });
        if (!otherSupplier || !tariq || !waterSupplier || !pgChicken) {
          throw new Error("A required supplier is missing");
        }

        const apple = await tx.inventoryItem.findFirst({
          where: { name: "Apple", active: true },
        });
        if (!apple) {
          await tx.inventoryItem.create({
            data: {
              name: "Apple",
              category: "Vegetables",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
          });
        }

        for (const name of ["Hit spray", "Handwash"]) {
          const found = await tx.expenseCategory.findFirst({
            where: { name, active: true },
          });
          if (!found) {
            await tx.expenseCategory.create({
              data: { name, group: "OTHER" },
            });
          }
        }

        let talib = await tx.employee.findFirst({
          where: { code: "KH-013", active: true },
        });
        if (!talib) {
          talib = await tx.employee.create({
            data: {
              name: "Talib Mansuri",
              code: "KH-013",
              monthlySalaryPaise: 0,
              dailyRatePaise: 0,
              paidLeavesPerMonth: 4,
              active: true,
              joinedAt: new Date("2026-08-13T00:00:00+05:30"),
            },
          });
        }

        const allSpecs = [
          ...OTHER_LINES,
          ...TARIQ_LINES,
          ...WATER_LINES,
          ...PG_LINES,
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
        const waterPurchase = await createPurchaseInTransaction(tx, {
          supplierId: waterSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: WATER_NOTE,
          lines: toLines(WATER_LINES, itemsByName),
        });
        const pgPurchase = await createPurchaseInTransaction(tx, {
          supplierId: pgChicken.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: PG_NOTE,
          lines: toLines(PG_LINES, itemsByName),
        });

        const otherPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: otherSupplier.id,
          paidAt: OCCURRED_AT,
          amountPaise: 550 * 100,
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

        const advances = [];
        for (const a of [
          {
            amountRupees: 210,
            method: "CASH" as const,
            note: "Talib Mansuri KH-013 cash",
          },
          {
            amountRupees: 350,
            method: "RECHARGE" as const,
            note: "Talib Mansuri KH-013 recharge",
          },
        ]) {
          const row = await tx.employeeAdvance.create({
            data: {
              employeeId: talib.id,
              occurredAt: OCCURRED_AT,
              amountPaise: a.amountRupees * 100,
              method: a.method,
              note: `${PAY_NOTE} — ${a.note}`,
            },
            select: { id: true, amountPaise: true, method: true, note: true },
          });
          advances.push(row);
        }

        return {
          otherPurchase,
          tariqPurchase,
          waterPurchase,
          pgPurchase,
          otherPay,
          expenseRows,
          advances,
          talib: { id: talib.id, name: talib.name, code: talib.code },
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
            result.waterPurchase.purchaseId,
            result.pgPurchase.purchaseId,
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
          talib: result.talib,
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
              supplier: "Other Supplier",
              amountRupees: 550,
              id: result.otherPay.paymentId,
            },
          ],
          advances: result.advances.map((a) => ({
            method: a.method,
            note: a.note,
            amountRupees: a.amountPaise / 100,
          })),
          skipped: [
            "sales",
            "cashbook",
            "sabzi lump 1500",
            "Dettol 700",
            "Kamran 610",
            "2 chicken Bal",
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
