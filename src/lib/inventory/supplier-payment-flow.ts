import type { Prisma } from "@prisma/client";

export type RecordSupplierPaymentInput = {
  supplierId: string;
  paidAt: Date;
  amountPaise: number;
  method: string;
  reference?: string;
  note?: string;
  createdByUserId?: string | null;
};

export async function recordSupplierPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordSupplierPaymentInput,
): Promise<{ paymentId: string }> {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }
  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, active: true },
  });
  if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");

  const pay = await tx.supplierPayment.create({
    data: {
      supplierId: supplier.id,
      paidAt: input.paidAt,
      amountPaise: Math.floor(input.amountPaise),
      method: input.method.trim().slice(0, 32).toLowerCase() || "cash",
      reference: (input.reference ?? "").trim().slice(0, 120),
      note: (input.note ?? "").trim().slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  await tx.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      occurredAt: input.paidAt,
      kind: "PAYMENT_CREDIT",
      debitPaise: 0,
      creditPaise: pay.amountPaise,
      referenceType: "supplier_payment",
      referenceId: pay.id,
      note: pay.note,
    },
  });

  return { paymentId: pay.id };
}
