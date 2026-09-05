/**
 * One-off: 8 Aug Kit Kat was personal; move to inventory.
 * PE Fam personal note → Farhan.
 *
 * Run: npx tsx scripts/fix-2026-08-08-kitkat-pefam.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";

const OCCURRED_AT = new Date("2026-08-08T12:00:00+05:30");
const NOTE = "Handwritten notebook 8/8 — Kit Kat (moved from personal)";
const KIT_PERSONAL_ID = "cmsxk3zq1003dvuteoe5woiuy";
const FAM_PERSONAL_ID = "cmsxk3zsb003evutevo16r3bx";

async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.purchase.findFirst({
      where: { notes: NOTE },
      select: { batchRef: true },
    });
    if (existing) {
      throw new Error(`Already corrected (${existing.batchRef})`);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const personal = await tx.personalUseEntry.findUnique({
          where: { id: KIT_PERSONAL_ID },
        });
        if (!personal) throw new Error("Kit Kat personal row missing");
        await tx.personalUseEntry.delete({ where: { id: personal.id } });

        const fam = await tx.personalUseEntry.update({
          where: { id: FAM_PERSONAL_ID },
          data: { note: "Handwritten notebook 8/8 — Farhan PE Fam" },
          select: { id: true, cashAmountPaise: true, note: true },
        });

        const otherSupplier = await tx.supplier.findFirst({
          where: { name: "Other Supplier", active: true },
        });
        const kit = await tx.inventoryItem.findFirst({
          where: { name: "Kit Kat", active: true },
        });
        if (!otherSupplier || !kit) {
          throw new Error("Supplier or Kit Kat missing");
        }

        const qtyPurchase = new Prisma.Decimal(2);
        const ratePaisePerPurchaseUnit = new Prisma.Decimal(40 * 100)
          .div(qtyPurchase)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          .toNumber();

        const purchase = await createPurchaseInTransaction(tx, {
          supplierId: otherSupplier.id,
          purchasedAt: OCCURRED_AT,
          paymentType: "CASH",
          notes: NOTE,
          lines: [
            {
              inventoryItemId: kit.id,
              qtyPurchase,
              ratePaisePerPurchaseUnit,
            },
          ],
        });

        return { fam, purchase };
      },
      { timeout: 60_000 },
    );

    const row = await prisma.purchase.findUniqueOrThrow({
      where: { id: result.purchase.purchaseId },
      select: {
        batchRef: true,
        totalPaise: true,
        lines: {
          select: {
            qtyPurchase: true,
            lineTotalPaise: true,
            item: { select: { name: true } },
          },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          deletedPersonal: "Kit Kat ₹40",
          personalNote: result.fam.note,
          purchase: {
            batchRef: row.batchRef,
            totalRupees: row.totalPaise / 100,
            lines: row.lines.map((line) => ({
              item: line.item.name,
              qty: String(line.qtyPurchase),
              lineRupees: line.lineTotalPaise / 100,
            })),
          },
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
