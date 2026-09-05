/**
 * Insert notebook purchases, expenses, personal use, and advances
 * for 2026-08-08. Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-08.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordOpeningOrAdjustment } from "../src/lib/inventory/stock-ops";

const OCCURRED_AT = new Date("2026-08-08T12:00:00+05:30");
const OTHER_NOTE = "Handwritten notebook 8/8 — cash purchases";
const TARIQ_NOTE = "Handwritten notebook 8/8 — Tariq Chicken";
const MUSHTAQ_NOTE = "Handwritten notebook 8/8 — Mushtaq credit";
const PAY_NOTE = "Handwritten notebook 8/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const OTHER_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "3", totalRupees: 150 },
  { itemName: "Mixed Vegetable", qty: "1", totalRupees: 450 },
  { itemName: "Atta", qty: "10", totalRupees: 370 },
  { itemName: "Onion", qty: "19", totalRupees: 700 },
  { itemName: "Ghee", qty: "2", totalRupees: 340 },
  { itemName: "Ajwain", qty: "0.06666667", totalRupees: 40 },
  { itemName: "Cabbage", qty: "2.5", totalRupees: 250 },
  { itemName: "Dips", qty: "1000", totalRupees: 500 },
  { itemName: "Shake Straw", qty: "80", totalRupees: 80 },
  { itemName: "Garbage Bags", qty: "100", totalRupees: 140 },
  { itemName: "Disposable Caps", qty: "100", totalRupees: 100 },
  { itemName: "Kit Kat", qty: "2", totalRupees: 40 },
];

const TARIQ_LINES: PurchaseSpec[] = [
  { itemName: "Full Live chicken", qty: "9", totalRupees: 1600 },
];

const MUSHTAQ_LINES: PurchaseSpec[] = [
  { itemName: "Maida", qty: "50", totalRupees: 1760 },
  { itemName: "Basmati Rice", qty: "20", totalRupees: 2200 },
];

const EXPENSES = [
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Steel wool", note: "Steel wool", amountRupees: 20 },
  { categoryName: "Staff Food", note: "Meat", amountRupees: 500 },
  { categoryName: "Photo Copy", note: "Scan print", amountRupees: 20 },
] as const;

const PERSONAL_CASH = [
  { note: "Farhan PE Fam", amountRupees: 1400 },
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
      where: { notes: { in: [OTHER_NOTE, TARIQ_NOTE, MUSHTAQ_NOTE] } },
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
        if (!otherSupplier || !tariq) {
          throw new Error("Other Supplier or Tariq Chicken is missing");
        }

        let mushtaq = await tx.supplier.findFirst({
          where: { name: "Mushtaq", active: true },
        });
        if (!mushtaq) {
          mushtaq = await tx.supplier.create({ data: { name: "Mushtaq" } });
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

        const caps = await tx.inventoryItem.findFirst({
          where: { name: "Disposable Caps", active: true },
        });
        if (!caps) {
          await tx.inventoryItem.create({
            data: {
              name: "Disposable Caps",
              category: "Disposable",
              baseUnit: "pc",
              purchaseUnit: "pcs",
              baseUnitsPerPurchaseUnit: new Prisma.Decimal(1),
            },
          });
        }

        const foundWool = await tx.expenseCategory.findFirst({
          where: { name: "Steel wool", active: true },
        });
        if (!foundWool) {
          await tx.expenseCategory.create({
            data: { name: "Steel wool", group: "OTHER" },
          });
        }

        const allSpecs = [...OTHER_LINES, ...TARIQ_LINES, ...MUSHTAQ_LINES];
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
        const mushtaqPurchase = await createPurchaseInTransaction(tx, {
          supplierId: mushtaq.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CREDIT",
          notes: MUSHTAQ_NOTE,
          lines: toLines(MUSHTAQ_LINES, itemsByName),
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

        const personalCashRows = [];
        for (const p of PERSONAL_CASH) {
          const row = await tx.personalUseEntry.create({
            data: {
              kind: "CASH",
              occurredAt: OCCURRED_AT,
              cashAmountPaise: p.amountRupees * 100,
              note: `${PAY_NOTE} — ${p.note}`,
            },
            select: { id: true, cashAmountPaise: true, note: true, kind: true },
          });
          personalCashRows.push(row);
        }

        const chicken = itemsByName.get("Full Live chicken")!;
        const settings = await ensureInventorySettings(tx);
        const personalStock = await tx.personalUseEntry.create({
          data: {
            kind: "STOCK",
            occurredAt: OCCURRED_AT,
            inventoryItemId: chicken.id,
            qtyBase: new Prisma.Decimal(250),
            note: `${PAY_NOTE} — boiled chicken 250 g`,
          },
          select: {
            id: true,
            kind: true,
            qtyBase: true,
            note: true,
          },
        });
        await recordOpeningOrAdjustment(tx, {
          allowNegativeStock: settings.allowNegativeStock,
          inventoryItemId: chicken.id,
          qtyDeltaBase: new Prisma.Decimal(250),
          direction: "down",
          reason: "OTHER",
          note: `PERSONAL_USE:${PAY_NOTE} — boiled chicken 250 g`.slice(0, 500),
          occurredAt: OCCURRED_AT,
          referenceType: "personal_use",
          referenceId: personalStock.id,
        });

        const advances = [];
        for (const a of [
          { employee: mehrej, amountRupees: 100, note: "Mehrej KH-001" },
          { employee: anwarul, amountRupees: 100, note: "Anwarul KH-004" },
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
          mushtaqPurchase,
          expenseRows,
          personalCashRows,
          personalStock,
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
            result.mushtaqPurchase.purchaseId,
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
          personalCash: result.personalCashRows.map((p) => ({
            note: p.note,
            amountRupees: p.cashAmountPaise / 100,
          })),
          personalStock: {
            note: result.personalStock.note,
            qtyBase: String(result.personalStock.qtyBase),
            item: "Full Live chicken",
          },
          advances: result.advances.map((a) => ({
            note: a.note,
            amountRupees: a.amountPaise / 100,
          })),
          skipped: [
            "sales",
            "cashbook",
            "bank 14000",
            "Shabir unpaid 2000",
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
