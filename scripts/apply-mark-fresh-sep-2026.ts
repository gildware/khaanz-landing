/**
 * Mark Fresh: opening ₹4,52,560 on 1 Sep 2026,
 * credit purchase frozen chicken 60 kg @ ₹285 + frozen fish 10 kg @ ₹255,
 * ICICI payment ₹30,000 on 2 Sep 2026.
 *
 * Run: npx tsx scripts/apply-mark-fresh-sep-2026.ts
 */
import { Prisma } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import {
  createSupplierOpeningBalanceInTransaction,
  deleteSupplierOpeningBalanceInTransaction,
} from "../src/lib/inventory/supplier-opening-balance";
import { recordSupplierPaymentInTransaction } from "../src/lib/inventory/supplier-payment-flow";
import { parseIstDateInput } from "../src/lib/ist-dates";
import { getPrisma } from "../src/lib/prisma";

const SUPPLIER_NAME = "Mark Fresh - (Chicken Fish)";
const OPENING_PAISE = 45_256_000;
const OPENING_NOTE = "Opening balance 1 Sep 2026";
const PURCHASE_NOTE =
  "1 Sep 2026 — frozen chicken 60 kg @ ₹285, frozen fish 10 kg @ ₹255";
const PAY_NOTE = "ICICI 2 Sep 2026";

async function main() {
  const prisma = getPrisma();
  const sept1 = parseIstDateInput("2026-09-01");
  const purchaseAt = new Date("2026-09-01T12:00:00+05:30");
  const payAt = new Date("2026-09-02T12:00:00+05:30");
  if (!sept1) throw new Error("Bad opening date");

  const result = await prisma.$transaction(
    async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { name: SUPPLIER_NAME, active: true },
      });
      if (!supplier) throw new Error(`SUPPLIER_NOT_FOUND:${SUPPLIER_NAME}`);

      const dupPurchase = await tx.purchase.findFirst({
        where: { supplierId: supplier.id, notes: PURCHASE_NOTE },
        select: { id: true, batchRef: true },
      });
      if (dupPurchase) {
        throw new Error(`Already applied (purchase ${dupPurchase.batchRef})`);
      }

      const chicken = await tx.inventoryItem.findFirst({
        where: { name: "Frozen Chicken Boneless", active: true },
        select: { id: true },
      });
      const fish = await tx.inventoryItem.findFirst({
        where: { name: "Frozen Fish", active: true },
        select: { id: true },
      });
      if (!chicken || !fish) throw new Error("Missing Frozen Chicken Boneless or Frozen Fish");

      const existingOpening = await tx.supplierLedgerEntry.findFirst({
        where: { supplierId: supplier.id, referenceType: "opening_balance" },
        select: { id: true },
      });
      if (existingOpening) {
        await deleteSupplierOpeningBalanceInTransaction(tx, supplier.id);
      }
      await createSupplierOpeningBalanceInTransaction(tx, {
        supplierId: supplier.id,
        amountPaise: OPENING_PAISE,
        occurredAt: sept1,
        note: OPENING_NOTE,
      });

      const purchase = await createPurchaseInTransaction(tx, {
        supplierId: supplier.id,
        purchasedAt: purchaseAt,
        paymentType: "CREDIT",
        notes: PURCHASE_NOTE,
        lines: [
          {
            inventoryItemId: chicken.id,
            qtyPurchase: new Prisma.Decimal(60),
            ratePaisePerPurchaseUnit: 28_500,
          },
          {
            inventoryItemId: fish.id,
            qtyPurchase: new Prisma.Decimal(10),
            ratePaisePerPurchaseUnit: 25_500,
          },
        ],
      });

      const pay = await recordSupplierPaymentInTransaction(tx, {
        supplierId: supplier.id,
        paidAt: payAt,
        amountPaise: 3_000_000,
        method: "icici",
        reference: "ICICI",
        note: PAY_NOTE,
      });

      const ledgerAgg = await tx.supplierLedgerEntry.aggregate({
        where: { supplierId: supplier.id },
        _sum: { debitPaise: true, creditPaise: true },
      });
      const balancePaise =
        (ledgerAgg._sum.debitPaise ?? 0) - (ledgerAgg._sum.creditPaise ?? 0);

      return {
        batchRef: purchase.batchRef,
        paymentId: pay.paymentId,
        balancePaise,
      };
    },
    { timeout: 60_000 },
  );

  console.log("Mark Fresh applied");
  console.log("  opening ₹4,52,560 on 1 Sep 2026");
  console.log(`  purchase ${result.batchRef} ₹19,650 (60 kg chicken @ ₹285, 10 kg fish @ ₹255)`);
  console.log("  payment ₹30,000 ICICI on 2 Sep 2026");
  console.log(
    `  ledger balance now ₹${(result.balancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
