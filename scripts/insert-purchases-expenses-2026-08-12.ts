/**
 * Insert notebook purchases, expenses, advances, supplier payment,
 * and Tasleem half-day leave for 2026-08-12.
 * Does not insert sales, cashbook, salary run, or owner cash-in.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-12.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-12T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 12/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 12/8 — Tariq Chicken";
const PAY_NOTE = "Handwritten notebook 12/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Potato", qty: "19", totalRupees: 300 },
  { itemName: "Curd", qty: "3.5", totalRupees: 280 },
  { itemName: "Dhaniya", qty: "0.83333333", totalRupees: 100 },
  { itemName: "Cabbage", qty: "5", totalRupees: 220 },
  { itemName: "Tomato", qty: "4", totalRupees: 100 },
  { itemName: "Capsicum", qty: "1", totalRupees: 60 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Green Chilli", qty: "1", totalRupees: 70 },
  { itemName: "Pepsi @ 20", qty: "24", totalRupees: 430 },
  { itemName: "Dew @ 20", qty: "30", totalRupees: 520 },
  { itemName: "Silver Foil", qty: "1", totalRupees: 600 },
  { itemName: "Pickle", qty: "3.57142857", totalRupees: 250 },
  { itemName: "Cardamom", qty: "0.09736842", totalRupees: 370 },
  { itemName: "Kitchen King", qty: "1", totalRupees: 660 },
  { itemName: "Dips", qty: "1000", totalRupees: 450 },
  { itemName: "Egg", qty: "30", totalRupees: 185 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "15", totalRupees: 2150 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 160 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Steel wool", note: "Steel wool", amountRupees: 20 },
  { categoryName: "Petrol", note: "Petrol", amountRupees: 600 },
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

        const mehrej = await tx.employee.findFirst({
          where: { code: "KH-001", active: true },
        });
        const tasleem = await tx.employee.findFirst({
          where: { code: "KH-010", active: true },
        });
        if (!mehrej || !tasleem) {
          throw new Error("Mehrej KH-001 or Tasleem KH-010 is missing");
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
          amountPaise: 2250 * 100,
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
          { employee: mehrej, amountRupees: 20, note: "Mehrej KH-001" },
          { employee: tasleem, amountRupees: 100, note: "Tasleem KH-010" },
        ]) {
          const row = await tx.employeeAdvance.create({
            data: {
              employeeId: a.employee.id,
              occurredAt: OCCURRED_AT,
              amountPaise: a.amountRupees * 100,
              method: "CASH",
              note: `${PAY_NOTE} — ${a.note}`,
            },
            select: { id: true, amountPaise: true, note: true },
          });
          advances.push(row);
        }

        const attendance = await tx.attendanceDay.upsert({
          where: {
            employeeId_dayKey: {
              employeeId: tasleem.id,
              dayKey: "2026-08-12",
            },
          },
          create: {
            employeeId: tasleem.id,
            dayKey: "2026-08-12",
            kind: "HALF_DAY_LEAVE",
            note: `${PAY_NOTE} — half day holiday`,
          },
          update: {
            kind: "HALF_DAY_LEAVE",
            note: `${PAY_NOTE} — half day holiday`,
          },
          select: {
            id: true,
            dayKey: true,
            kind: true,
            employee: { select: { name: true, code: true } },
          },
        });

        return {
          otherPurchase,
          tariqPurchase,
          nazirPay,
          expenseRows,
          advances,
          attendance,
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
              amountRupees: 2250,
              id: result.nazirPay.paymentId,
            },
          ],
          advances: result.advances.map((a) => ({
            note: a.note,
            amountRupees: a.amountPaise / 100,
          })),
          attendance: result.attendance,
          skipped: [
            "sales",
            "cashbook",
            "sabzi lump 1000",
            "empty 2 cylinder",
            "home rice 30 kg",
            "Kans tin 40000 owner cash-in",
            "salary run",
            "duplicate dhaniya (same ₹100 as sabzi slip)",
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
