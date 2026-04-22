import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function safeDate(x: string | null): Date | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = safeDate(url.searchParams.get("from"));
  const to = safeDate(url.searchParams.get("to"));

  const prisma = getPrisma();

  const suppliers = await prisma.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const supplierIds = suppliers.map((s) => s.id);
  if (supplierIds.length === 0) return NextResponse.json({ rows: [] });

  const purchaseWhere =
    from && to ? { purchasedAt: { gte: from, lte: to } } : undefined;
  const paymentWhere = from && to ? { paidAt: { gte: from, lte: to } } : undefined;
  const returnWhere =
    from && to ? { returnedAt: { gte: from, lte: to } } : undefined;

  const [purchaseAgg, paymentAgg, returnAgg, ledgerAgg] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds }, ...(purchaseWhere ?? {}) },
      _sum: { totalPaise: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds }, ...(paymentWhere ?? {}) },
      _sum: { amountPaise: true },
    }),
    prisma.purchaseReturn.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds }, ...(returnWhere ?? {}) },
      _sum: { totalCreditPaise: true },
    }),
    prisma.supplierLedgerEntry.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds } },
      _sum: { debitPaise: true, creditPaise: true },
    }),
  ]);

  const totalPurchase = new Map(purchaseAgg.map((r) => [r.supplierId, r._sum.totalPaise ?? 0]));
  const totalPaid = new Map(paymentAgg.map((r) => [r.supplierId, r._sum.amountPaise ?? 0]));
  const totalReturn = new Map(returnAgg.map((r) => [r.supplierId, r._sum.totalCreditPaise ?? 0]));

  const balance = new Map(
    ledgerAgg.map((r) => [
      r.supplierId,
      (r._sum.debitPaise ?? 0) - (r._sum.creditPaise ?? 0),
    ]),
  );

  const now = new Date();
  const overdue = await prisma.purchase.groupBy({
    by: ["supplierId"],
    where: { supplierId: { in: supplierIds }, paymentType: "CREDIT", dueAt: { lt: now } },
    _count: { id: true },
    _sum: { totalPaise: true },
  });
  const overdueBy = new Map(
    overdue.map((r) => [r.supplierId, { count: r._count.id, totalPaise: r._sum.totalPaise ?? 0 }]),
  );

  const rows = suppliers.map((s) => {
    const pending = balance.get(s.id) ?? 0;
    const od = overdueBy.get(s.id) ?? { count: 0, totalPaise: 0 };
    return {
      supplierId: s.id,
      supplierName: s.name,
      totalPurchasePaise: totalPurchase.get(s.id) ?? 0,
      totalPaidPaise: totalPaid.get(s.id) ?? 0,
      totalReturnCreditPaise: totalReturn.get(s.id) ?? 0,
      pendingPaise: pending,
      overdue: od,
    };
  });

  return NextResponse.json({
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    rows,
  });
}

