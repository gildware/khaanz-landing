import type { Prisma } from "@prisma/client";

export type RecordVendorPaymentInput = {
  vendorId: string;
  paidAt: Date;
  amountPaise: number;
  method: string;
  reference?: string;
  note?: string;
  createdByUserId?: string | null;
};

export async function recordVendorPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordVendorPaymentInput,
): Promise<{ paymentId: string }> {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("PAYMENT_AMOUNT_INVALID");
  }

  const vendor = await tx.vendor.findFirst({
    where: { id: input.vendorId, active: true },
  });
  if (!vendor) throw new Error("VENDOR_NOT_FOUND");

  const pay = await tx.vendorPayment.create({
    data: {
      vendorId: vendor.id,
      paidAt: input.paidAt,
      amountPaise: Math.floor(input.amountPaise),
      method: input.method.trim().slice(0, 32).toLowerCase() || "cash",
      reference: (input.reference ?? "").trim().slice(0, 120),
      note: (input.note ?? "").trim().slice(0, 500),
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true, amountPaise: true, note: true },
  });

  await tx.vendorLedgerEntry.create({
    data: {
      vendorId: vendor.id,
      occurredAt: input.paidAt,
      kind: "PAYMENT_CREDIT",
      debitPaise: 0,
      creditPaise: pay.amountPaise,
      referenceType: "vendor_payment",
      referenceId: pay.id,
      note: pay.note,
    },
  });

  return { paymentId: pay.id };
}

