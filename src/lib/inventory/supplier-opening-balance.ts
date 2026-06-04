import type { Prisma } from "@prisma/client";

export async function createSupplierOpeningBalanceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    supplierId: string;
    amountPaise: number;
    occurredAt?: Date;
    note?: string;
  },
) {
  const amountPaise = Math.floor(input.amountPaise);
  if (amountPaise <= 0) {
    throw new Error("Opening balance must be greater than zero");
  }

  const existing = await tx.supplierLedgerEntry.findFirst({
    where: {
      supplierId: input.supplierId,
      referenceType: "opening_balance",
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Opening balance already recorded for this supplier");
  }

  const occurredAt = input.occurredAt ?? new Date();
  const note = (input.note ?? "Opening balance").trim().slice(0, 500);

  // Use PURCHASE_DEBIT so opening balance works even when the DB enum
  // has not been migrated to include OPENING_BALANCE yet.
  await tx.supplierLedgerEntry.create({
    data: {
      supplierId: input.supplierId,
      occurredAt,
      kind: "PURCHASE_DEBIT",
      debitPaise: amountPaise,
      creditPaise: 0,
      referenceType: "opening_balance",
      referenceId: input.supplierId,
      note,
    },
  });
}

export async function deleteSupplierOpeningBalanceInTransaction(
  tx: Prisma.TransactionClient,
  supplierId: string,
) {
  const existing = await tx.supplierLedgerEntry.findFirst({
    where: {
      supplierId,
      referenceType: "opening_balance",
    },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("No opening balance to remove");
  }

  await tx.supplierLedgerEntry.delete({ where: { id: existing.id } });
}
