/**
 * Insert notebook purchases, expenses, personal use, advances,
 * and supplier payment for 2026-08-06. Does not insert sales.
 * Faisal leave already marked.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-06.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-06T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 6/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 6/8 — Tariq Chicken";
const MARK_NOTE = "Handwritten notebook 6/8 — Mark Fresh credit";
const PAY_NOTE = "Handwritten notebook 6/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Capsicum", qty: "1", totalRupees: 50 },
  { itemName: "Dhaniya", qty: "0.5", totalRupees: 120 },
  { itemName: "Tomato", qty: "1", totalRupees: 60 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Green Chilli", qty: "2", totalRupees: 100 },
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Magaz Tarbooz", qty: "0.5", totalRupees: 330 },
  { itemName: "Cashew", qty: "1", totalRupees: 450 },
  { itemName: "Tomato", qty: "2", totalRupees: 100 },
  { itemName: "Meat Masala", qty: "0.5", totalRupees: 440 },
  { itemName: "Burger Buns", qty: "36", totalRupees: 300 },
  { itemName: "Ajina Moto", qty: "2.5", totalRupees: 500 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "9", totalRupees: 1600 },
];

const MARK_LINES: PurchaseSpec[] = [
  { itemName: "Frozen Chicken Boneless", qty: "40", totalRupees: 14000 },
  { itemName: "Frozen Fish", qty: "20", totalRupees: 5200 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Surf & Soap", note: "Soap", amountRupees: 110 },
  { categoryName: "Generator oil", note: "Generator mobil oil", amountRupees: 270 },
  { categoryName: "Surf & Soap", note: "Surf", amountRupees: 110 },
] as const;

const PERSONAL = [
  { note: "Extra roti", amountRupees: 100 },
  { note: "Muzaffar nashta", amountRupees: 700 },
  { note: "Farhan cash", amountRupees: 1250 },
  { note: "Farhan diesel", amountRupees: 500 },
  { note: "Masala", amountRupees: 550 },
  { note: "Home", amountRupees: 3100 },
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
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        if (!otherSupplier || !tariq || !markFresh || !nazirGas) {
          throw new Error("A required supplier is missing");
        }

        const mehrej = await tx.employee.findFirst({
          where: { code: "KH-001", active: true },
        });
        const anwarul = await tx.employee.findFirst({
          where: { code: "KH-004", active: true },
        });
        if (!mehrej || !anwarul) {
          throw new Error("Mehrej KH-001 or Anwarul KH-004 is missing");
        }

        const magaz = await tx.inventoryItem.findFirst({
          where: { name: "Magaz Tarbooz", active: true },
        });
        if (!magaz) {
          await tx.inventoryItem.create({
            data: {
              name: "Magaz Tarbooz",
              category: "Dry",
              baseUnit: "g",
              purchaseUnit: "kg",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1000),
            },
          });
        }

        const foundOil = await tx.expenseCategory.findFirst({
          where: { name: "Generator oil", active: true },
        });
        if (!foundOil) {
          await tx.expenseCategory.create({
            data: { name: "Generator oil", group: "OTHER" },
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

        const nazirPay = await recordSupplierPaymentInTransaction(tx, {
          supplierId: nazirGas.id,
          paidAt: OCCURRED_AT,
          amountPaise: 3000 * 100,
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

        const advances = [];
        for (const a of [
          { employee: mehrej, amountRupees: 500, note: "Mehrej KH-001" },
          { employee: anwarul, amountRupees: 2700, note: "Anwarul KH-004" },
          { employee: anwarul, amountRupees: 2650, note: "Anwarul KH-004" },
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

        return {
          otherPurchase,
          tariqPurchase,
          markPurchase,
          nazirPay,
          expenseRows,
          personalRows,
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
          advances: result.advances.map((a) => ({
            note: a.note,
            amountRupees: a.amountPaise / 100,
          })),
          supplierPayment: {
            supplier: "Nazir Gas",
            amountRupees: 3000,
            id: result.nazirPay.paymentId,
          },
          skipped: [
            "sales",
            "cashbook",
            "sabzi lump 400 (used veg list)",
            "duplicate meat masala 440",
            "Faisal leave already marked",
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
