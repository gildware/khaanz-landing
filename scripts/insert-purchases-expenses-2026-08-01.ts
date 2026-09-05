/**
 * Insert notebook purchases, expenses, personal use, advance,
 * supplier payments, and kitchen use for 2026-08-01.
 * Does not insert sales or cashbook.
 *
 * Run: npx tsx scripts/insert-purchases-expenses-2026-08-01.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { recordKitchenUse } from "../src/lib/inventory/stock-ops";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";

const OCCURRED_AT = new Date("2026-08-01T12:00:00+05:30");
const PURCHASE_NOTE = "Handwritten notebook 1/8 — cash purchases";
const KITCHEN_NOTE = "Handwritten notebook 1/8 — kitchen use";
const PAY_NOTE = "Handwritten notebook 1/8";

type PurchaseSpec = {
  itemName: string;
  qty: string;
  totalRupees: number;
};

const PURCHASE_LINES: PurchaseSpec[] = [
  { itemName: "Milk", qty: "2", totalRupees: 100 },
  { itemName: "Curd", qty: "5", totalRupees: 250 },
  { itemName: "Full Live chicken", qty: "7.2", totalRupees: 1000 },
  { itemName: "Full Live chicken", qty: "7.8", totalRupees: 1090 },
  { itemName: "Ginger", qty: "1", totalRupees: 300 },
  { itemName: "Potato", qty: "19", totalRupees: 300 },
  { itemName: "Egg", qty: "30", totalRupees: 190 },
  { itemName: "Onion", qty: "18", totalRupees: 360 },
  { itemName: "Garlic", qty: "12", totalRupees: 540 },
  { itemName: "Cling Foil", qty: "2", totalRupees: 400 },
  { itemName: "Container Big", qty: "100", totalRupees: 330 },
  { itemName: "Lemon", qty: "0.25", totalRupees: 50 },
  { itemName: "Butter Paper", qty: "100", totalRupees: 100 },
  { itemName: "Capsicum", qty: "1", totalRupees: 80 },
  { itemName: "Carrot", qty: "1", totalRupees: 70 },
  { itemName: "Dhaniya", qty: "1", totalRupees: 110 },
  { itemName: "Tomato", qty: "2", totalRupees: 100 },
  { itemName: "Cabbage", qty: "4", totalRupees: 150 },
];

const EXPENSES = [
  { categoryName: "Lighter", note: "4 lighter", amountRupees: 20 },
  { categoryName: "Surf & Soap", note: "Surf & Soap", amountRupees: 50 },
  { categoryName: "Staff Food", note: "Roti", amountRupees: 150 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
  { categoryName: "Staff Food", note: "Veg", amountRupees: 150 },
] as const;

const PERSONAL = [
  { note: "Kaju Badam", amountRupees: 860 },
  { note: "Personal cylinder", amountRupees: 1200 },
  { note: "Education loan", amountRupees: 2500 },
] as const;

const KITCHEN_USE = [
  { itemName: "Oil", qtyPurchase: "15" },
  { itemName: "Corn Flour", qtyPurchase: "1" },
  { itemName: "GAS", qtyPurchase: "14" },
] as const;

function ratePaise(totalRupees: number, qty: Prisma.Decimal): number {
  return new Prisma.Decimal(totalRupees * 100)
    .div(qty)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.purchase.findFirst({
      where: { notes: PURCHASE_NOTE },
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
        const tops = await tx.supplier.findFirst({
          where: { name: "Tops", active: true },
        });
        const nazirGas = await tx.supplier.findFirst({
          where: { name: "Nazir Gas", active: true },
        });
        if (!otherSupplier || !tops || !nazirGas) {
          throw new Error("Other Supplier, Tops, or Nazir Gas is missing");
        }

        const ebran = await tx.employee.findFirst({
          where: { code: "KH-006", active: true },
        });
        if (!ebran) throw new Error("Employee Ebran (KH-006) is missing");

        for (const name of ["Lighter", "Surf & Soap"]) {
          const found = await tx.expenseCategory.findFirst({
            where: { name, active: true },
          });
          if (!found) {
            await tx.expenseCategory.create({
              data: { name, group: "OTHER" },
            });
          }
        }

        const purchaseNames = [...new Set(PURCHASE_LINES.map((l) => l.itemName))];
        const kitchenNames = KITCHEN_USE.map((l) => l.itemName);
        const items = await tx.inventoryItem.findMany({
          where: {
            name: { in: [...purchaseNames, ...kitchenNames] },
            active: true,
          },
          select: {
            id: true,
            name: true,
            purchaseUnit: true,
            baseUnitsPerPurchaseUnit: true,
          },
        });
        const itemsByName = new Map(items.map((item) => [item.name, item]));
        const missingItems = [...purchaseNames, ...kitchenNames].filter(
          (name) => !itemsByName.has(name),
        );
        if (missingItems.length > 0) {
          throw new Error(`Missing items: ${missingItems.join(", ")}`);
        }

        const purchase = await createPurchaseInTransaction(tx, {
          supplierId: otherSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: PURCHASE_NOTE,
          lines: PURCHASE_LINES.map((spec) => {
            const item = itemsByName.get(spec.itemName)!;
            const qtyPurchase = new Prisma.Decimal(spec.qty);
            return {
              inventoryItemId: item.id,
              qtyPurchase,
              ratePaisePerPurchaseUnit: ratePaise(spec.totalRupees, qtyPurchase),
            };
          }),
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
            employeeId: ebran.id,
            occurredAt: OCCURRED_AT,
            amountPaise: 353 * 100,
            method: "RECHARGE",
            note: `${PAY_NOTE} — Ebran recharge`,
          },
          select: { id: true, amountPaise: true },
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
          amountPaise: 2054 * 100,
          method: "cash",
          note: `${PAY_NOTE} — Tops (settles 28/7 credit)`,
        });

        const settings = await ensureInventorySettings(tx);
        const kitchenRows = [];
        for (const use of KITCHEN_USE) {
          const item = itemsByName.get(use.itemName)!;
          const qtyBase = new Prisma.Decimal(use.qtyPurchase).mul(
            item.baseUnitsPerPurchaseUnit,
          );
          const row = await recordKitchenUse(tx, {
            inventoryItemId: item.id,
            qtyBase,
            usedAt: OCCURRED_AT,
            note: `${KITCHEN_NOTE} — ${use.itemName}`,
            allowNegativeStock: settings.allowNegativeStock,
          });
          kitchenRows.push({
            item: use.itemName,
            qtyPurchase: use.qtyPurchase,
            id: row.id,
            costPaise: row.costPaise,
          });
        }

        return {
          purchase,
          expenseRows,
          personalRows,
          advance,
          nazirPay,
          topsPay,
          kitchenRows,
        };
      },
      { timeout: 90_000 },
    );

    const purchaseRow = await prisma.purchase.findUniqueOrThrow({
      where: { id: result.purchase.purchaseId },
      select: {
        id: true,
        batchRef: true,
        totalPaise: true,
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
          purchase: {
            id: purchaseRow.id,
            batchRef: purchaseRow.batchRef,
            totalRupees: purchaseRow.totalPaise / 100,
            lines: purchaseRow.lines.map((l) => ({
              item: l.item.name,
              qty: String(l.qtyPurchase),
              unit: l.item.purchaseUnit,
              lineRupees: l.lineTotalPaise / 100,
            })),
          },
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
            id: result.advance.id,
            amountRupees: result.advance.amountPaise / 100,
            employee: "Ebran KH-006",
            method: "RECHARGE",
          },
          supplierPayments: [
            { supplier: "Nazir Gas", amountRupees: 3000, id: result.nazirPay.paymentId },
            { supplier: "Tops", amountRupees: 2054, id: result.topsPay.paymentId },
          ],
          kitchenUse: result.kitchenRows.map((k) => ({
            item: k.item,
            qty: k.qtyPurchase,
            costRupees: k.costPaise / 100,
            id: k.id,
          })),
          skipped: ["sales (POS already has 1 Aug)", "cashbook"],
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
