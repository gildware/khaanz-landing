import { Prisma, type VendorSalePaymentType } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";
import { applyVendorSaleInventoryDeduction } from "@/lib/inventory/apply-vendor-sale-inventory";
import {
  mergeConsumption,
  resolveRecipeVersion,
  scaleRecipe,
} from "@/lib/inventory/recipe-resolve";

export type VendorSaleLineInput = {
  menuItemId: string;
  variationId: string;
  quantity: Prisma.Decimal;
  ratePaisePerUnit: number;
};

export type CreateVendorSaleInput = {
  vendorId: string;
  soldAt: Date;
  paymentType: VendorSalePaymentType;
  creditDays?: number | null;
  notes?: string;
  createdByUserId?: string | null;
  lines: VendorSaleLineInput[];
};

function addDays(d0: Date, days: number): Date {
  const x = new Date(d0.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export async function createVendorSaleInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateVendorSaleInput,
): Promise<{ saleId: string }> {
  if (input.lines.length === 0) throw new Error("VENDOR_SALE_EMPTY");

  const vendor = await tx.vendor.findFirst({
    where: { id: input.vendorId, active: true },
    select: { id: true, defaultCreditDays: true, name: true },
  });
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const now = input.soldAt;
  const creditDaysResolved =
    input.paymentType === "CREDIT"
      ? (input.creditDays ?? vendor.defaultCreditDays ?? 15)
      : null;

  const dueAt =
    input.paymentType === "CREDIT" && creditDaysResolved != null
      ? addDays(now, creditDaysResolved)
      : null;

  let totalPaise = 0;
  const prepared: {
    menuItemId: string;
    variationId: string;
    quantity: Prisma.Decimal;
    ratePaisePerUnit: number;
    lineTotalPaise: number;
  }[] = [];

  for (const ln of input.lines) {
    const qty = ln.quantity.abs();
    if (!qty.greaterThan(D0)) continue;
    const rate = Math.floor(ln.ratePaisePerUnit);
    if (!Number.isFinite(rate) || rate < 0) throw new Error("VENDOR_SALE_RATE_INVALID");

    const lineTotal = qty
      .mul(d(rate))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
    if (!Number.isFinite(lineTotal) || lineTotal < 0) {
      throw new Error("VENDOR_SALE_LINE_TOTAL_INVALID");
    }
    totalPaise += lineTotal;

    prepared.push({
      menuItemId: ln.menuItemId,
      variationId: ln.variationId,
      quantity: qty,
      ratePaisePerUnit: rate,
      lineTotalPaise: lineTotal,
    });
  }

  if (prepared.length === 0) throw new Error("VENDOR_SALE_EMPTY");

  const sale = await tx.vendorSale.create({
    data: {
      vendorId: vendor.id,
      soldAt: now,
      paymentType: input.paymentType,
      creditDays: creditDaysResolved,
      dueAt,
      totalPaise,
      notes: (input.notes ?? "").trim().slice(0, 2000),
      createdByUserId: input.createdByUserId ?? null,
      lines: {
        create: prepared.map((p) => ({
          menuItemId: p.menuItemId,
          variationId: p.variationId,
          quantity: p.quantity,
          ratePaisePerUnit: p.ratePaisePerUnit,
          lineTotalPaise: p.lineTotalPaise,
        })),
      },
    },
    select: { id: true },
  });

  await tx.vendorLedgerEntry.create({
    data: {
      vendorId: vendor.id,
      occurredAt: now,
      kind: "SALE_DEBIT",
      debitPaise: totalPaise,
      creditPaise: 0,
      referenceType: "vendor_sale",
      referenceId: sale.id,
      note: `Sale to ${vendor.name}`.slice(0, 500),
    },
  });

  // Inventory deduction is always applied at sale time (cash or credit),
  // based on recipes for the sold menu items.
  const totals = new Map<string, Prisma.Decimal>();
  for (const p of prepared) {
    const recipe = await resolveRecipeVersion(tx, p.menuItemId, p.variationId, now);
    if (!recipe) continue;
    mergeConsumption(totals, scaleRecipe(recipe, p.quantity));
  }
  await applyVendorSaleInventoryDeduction(tx, sale.id, totals, input.createdByUserId ?? null, now);

  if (input.paymentType === "CASH") {
    const pay = await tx.vendorPayment.create({
      data: {
        vendorId: vendor.id,
        paidAt: now,
        amountPaise: totalPaise,
        method: "cash",
        reference: sale.id,
        note: "Auto-settled cash sale",
        createdByUserId: input.createdByUserId ?? null,
      },
      select: { id: true },
    });
    await tx.vendorLedgerEntry.create({
      data: {
        vendorId: vendor.id,
        occurredAt: now,
        kind: "PAYMENT_CREDIT",
        debitPaise: 0,
        creditPaise: totalPaise,
        referenceType: "vendor_payment",
        referenceId: pay.id,
        note: `Against sale ${sale.id}`.slice(0, 500),
      },
    });
  }

  return { saleId: sale.id };
}

