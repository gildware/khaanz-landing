import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;

  const prisma = getPrisma();

  const items = await prisma.inventoryItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const lowStock = items
    .filter((r) => r.stockOnHandBase.lessThan(r.minStockBase))
    .map((r) => ({
      id: r.id,
      name: r.name,
      baseUnit: r.baseUnit,
      stockOnHandBase: r.stockOnHandBase.toString(),
      minStockBase: r.minStockBase.toString(),
    }));

  const ledgerAgg = await prisma.supplierLedgerEntry.groupBy({
    by: ["supplierId"],
    _sum: { debitPaise: true, creditPaise: true },
  });

  const supplierIds = ledgerAgg.map((g) => g.supplierId);
  const suppliers =
    supplierIds.length > 0
      ? await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
        })
      : [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const supplierBalances = ledgerAgg.map((g) => ({
    supplierId: g.supplierId,
    supplierName: supplierName.get(g.supplierId) ?? "",
    balancePaise:
      (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0),
  }));

  const now = new Date();
  const overduePurchases = await prisma.purchase.findMany({
    where: {
      paymentType: "CREDIT",
      dueAt: { lt: now },
    },
    orderBy: { dueAt: "asc" },
    take: 50,
    include: { supplier: { select: { name: true } } },
  });

  let movementCounts: Record<string, number> | null = null;
  if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
    const movements = await prisma.inventoryMovement.groupBy({
      by: ["type"],
      where: { occurredAt: { gte: from, lte: to } },
      _count: { id: true },
    });
    movementCounts = Object.fromEntries(
      movements.map((m) => [m.type, m._count.id]),
    );
  }

  return NextResponse.json({
    lowStock,
    supplierBalances,
    overduePurchases: overduePurchases.map((p) => ({
      id: p.id,
      batchRef: p.batchRef,
      supplierName: p.supplier.name,
      totalPaise: p.totalPaise,
      dueAt: p.dueAt?.toISOString() ?? null,
      purchasedAt: p.purchasedAt.toISOString(),
    })),
    movementCounts,
  });
}
