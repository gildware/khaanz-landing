/**
 * Mother Dairy → Sadat Trader:
 * opening ₹13,430 on 1 Sep 2026, credit purchase ₹14,345 (bill / ledger only, no stock).
 *
 * Run: npx tsx scripts/apply-sadat-trader-sep-2026.ts
 */
import {
  createSupplierOpeningBalanceInTransaction,
  deleteSupplierOpeningBalanceInTransaction,
} from "../src/lib/inventory/supplier-opening-balance";
import {
  allocateNextPurchaseSequence,
  nextPurchaseBatchRef,
} from "../src/lib/inventory/purchase-ref";
import { parseIstDateInput } from "../src/lib/ist-dates";
import { getPrisma } from "../src/lib/prisma";

const OLD_NAME = "Mother Dairy";
const NEW_NAME = "Sadat Trader";
const OPENING_PAISE = 1_343_000;
const OPENING_NOTE = "Opening balance 1 Sep 2026";
const PURCHASE_PAISE = 1_434_500;
const PURCHASE_NOTE = "1 Sep 2026 — bill ₹14,345 (no line items)";

async function main() {
  const prisma = getPrisma();
  const sept1 = parseIstDateInput("2026-09-01");
  const purchaseAt = new Date("2026-09-01T12:00:00+05:30");
  if (!sept1) throw new Error("Bad opening date");

  const result = await prisma.$transaction(
    async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: {
          active: true,
          OR: [{ name: OLD_NAME }, { name: NEW_NAME }],
        },
        orderBy: { name: "asc" },
      });
      if (!supplier) throw new Error(`SUPPLIER_NOT_FOUND:${OLD_NAME}`);

      const nameClash = await tx.supplier.findFirst({
        where: { name: NEW_NAME, id: { not: supplier.id } },
        select: { id: true },
      });
      if (nameClash) throw new Error("NAME_TAKEN:Sadat Trader");

      const dupPurchase = await tx.purchase.findFirst({
        where: { supplierId: supplier.id, notes: PURCHASE_NOTE },
        select: { id: true, batchRef: true },
      });
      if (dupPurchase) {
        throw new Error(`Already applied (purchase ${dupPurchase.batchRef})`);
      }

      if (supplier.name !== NEW_NAME) {
        await tx.supplier.update({
          where: { id: supplier.id },
          data: { name: NEW_NAME },
        });
      }

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

      const batchRef = nextPurchaseBatchRef(
        purchaseAt,
        await allocateNextPurchaseSequence(tx, purchaseAt),
      );

      const purchase = await tx.purchase.create({
        data: {
          batchRef,
          supplierId: supplier.id,
          purchasedAt: purchaseAt,
          paymentType: "CREDIT",
          creditDays: supplier.defaultCreditDays ?? 15,
          dueAt: new Date(purchaseAt.getTime() + 15 * 24 * 60 * 60 * 1000),
          totalPaise: PURCHASE_PAISE,
          notes: PURCHASE_NOTE,
        },
      });

      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: supplier.id,
          occurredAt: purchaseAt,
          kind: "PURCHASE_DEBIT",
          debitPaise: PURCHASE_PAISE,
          creditPaise: 0,
          referenceType: "purchase",
          referenceId: purchase.id,
          note: `Purchase ${batchRef}`,
        },
      });

      const ledgerAgg = await tx.supplierLedgerEntry.aggregate({
        where: { supplierId: supplier.id },
        _sum: { debitPaise: true, creditPaise: true },
      });
      const balancePaise =
        (ledgerAgg._sum.debitPaise ?? 0) - (ledgerAgg._sum.creditPaise ?? 0);

      return {
        supplierId: supplier.id,
        renamedFrom: supplier.name,
        batchRef: purchase.batchRef,
        balancePaise,
      };
    },
    { timeout: 60_000 },
  );

  console.log("Sadat Trader applied");
  console.log(`  renamed ${result.renamedFrom} → ${NEW_NAME}`);
  console.log("  opening ₹13,430 on 1 Sep 2026 (replaced previous opening)");
  console.log(`  purchase ${result.batchRef} ₹14,345 credit (no stock lines)`);
  console.log(
    `  ledger balance now ₹${(result.balancePaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
