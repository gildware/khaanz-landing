import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const prisma = getPrisma();

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [
    ledgerAgg,
    purchaseAgg,
    paymentAgg,
    returnAgg,
    openingEntry,
    purchaseCount,
  ] = await Promise.all([
    prisma.supplierLedgerEntry.aggregate({
      where: { supplierId: id },
      _sum: { debitPaise: true, creditPaise: true },
    }),
    prisma.purchase.aggregate({
      where: { supplierId: id },
      _sum: { totalPaise: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { supplierId: id },
      _sum: { amountPaise: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: { supplierId: id },
      _sum: { totalCreditPaise: true },
    }),
    prisma.supplierLedgerEntry.findFirst({
      where: { supplierId: id, referenceType: "opening_balance" },
      select: { debitPaise: true, occurredAt: true, note: true },
    }),
    prisma.purchase.count({ where: { supplierId: id } }),
  ]);

  const balancePaise =
    (ledgerAgg._sum.debitPaise ?? 0) - (ledgerAgg._sum.creditPaise ?? 0);

  return NextResponse.json({
    supplier,
    stats: {
      balancePaise,
      totalPurchasesPaise: purchaseAgg._sum.totalPaise ?? 0,
      purchaseCount,
      totalPaidPaise: paymentAgg._sum.amountPaise ?? 0,
      totalReturnsPaise: returnAgg._sum.totalCreditPaise ?? 0,
      hasOpeningBalance: openingEntry !== null,
      openingBalancePaise: openingEntry?.debitPaise ?? 0,
      openingBalanceAt: openingEntry?.occurredAt.toISOString() ?? null,
      openingBalanceNote: openingEntry?.note ?? "",
    },
  });
}

export async function PATCH(request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 200);
  }
  if (typeof body.phone === "string") data.phone = body.phone.trim().slice(0, 32);
  if (typeof body.address === "string") {
    data.address = body.address.trim().slice(0, 4000);
  }
  if (body.defaultCreditDays === null) {
    data.defaultCreditDays = null;
  } else if (typeof body.defaultCreditDays === "number") {
    const n = Math.floor(body.defaultCreditDays);
    if (n < 0 || n > 365) {
      return NextResponse.json({ error: "Invalid credit days" }, { status: 400 });
    }
    data.defaultCreditDays = n;
  }
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    const row = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const prisma = getPrisma();

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Supplier relations all use onDelete: Restrict, so a hard delete is only
  // possible when there is no purchase/ledger/payment/return history.
  // Otherwise we archive (deactivate) to keep accounting intact.
  const [purchases, ledgerEntries, payments, purchaseReturns] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: id } }),
    prisma.supplierLedgerEntry.count({ where: { supplierId: id } }),
    prisma.supplierPayment.count({ where: { supplierId: id } }),
    prisma.purchaseReturn.count({ where: { supplierId: id } }),
  ]);

  const linkedCount = purchases + ledgerEntries + payments + purchaseReturns;

  if (linkedCount === 0) {
    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  await prisma.supplier.update({ where: { id }, data: { active: false } });
  return NextResponse.json({
    ok: true,
    deleted: false,
    archived: true,
    linkedRecords: { purchases, ledgerEntries, payments, purchaseReturns },
  });
}
