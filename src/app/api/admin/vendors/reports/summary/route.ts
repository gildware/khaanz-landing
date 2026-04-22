import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();

  const ledgerAgg = await prisma.vendorLedgerEntry.groupBy({
    by: ["vendorId"],
    _sum: { debitPaise: true, creditPaise: true },
  });

  const vendorIds = ledgerAgg.map((g) => g.vendorId);
  const vendors =
    vendorIds.length > 0
      ? await prisma.vendor.findMany({ where: { id: { in: vendorIds } } })
      : [];
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  const vendorBalances = ledgerAgg
    .map((g) => ({
      vendorId: g.vendorId,
      vendorName: vendorName.get(g.vendorId) ?? "",
      balancePaise: (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0),
    }))
    .sort((a, b) => b.balancePaise - a.balancePaise);

  const now = new Date();
  const overdueSales = await prisma.vendorSale.findMany({
    where: { paymentType: "CREDIT", dueAt: { lt: now } },
    orderBy: { dueAt: "asc" },
    take: 50,
    include: { vendor: { select: { name: true } } },
  });

  return NextResponse.json({
    vendorBalances,
    overdueSales: overdueSales.map((s) => ({
      id: s.id,
      vendorId: s.vendorId,
      vendorName: s.vendor.name,
      totalPaise: s.totalPaise,
      dueAt: s.dueAt?.toISOString() ?? null,
      soldAt: s.soldAt.toISOString(),
    })),
  });
}

