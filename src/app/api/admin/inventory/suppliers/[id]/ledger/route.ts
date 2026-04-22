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

  const entries = await prisma.supplierLedgerEntry.findMany({
    where: { supplierId: id },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });

  let running = 0;
  const withBalance = entries.map((e) => {
    running += e.debitPaise - e.creditPaise;
    return {
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      kind: e.kind,
      debitPaise: e.debitPaise,
      creditPaise: e.creditPaise,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      note: e.note,
      balancePaise: running,
    };
  });

  const agg = await prisma.supplierLedgerEntry.aggregate({
    where: { supplierId: id },
    _sum: { debitPaise: true, creditPaise: true },
  });
  const balancePaise =
    (agg._sum.debitPaise ?? 0) - (agg._sum.creditPaise ?? 0);

  return NextResponse.json({
    supplierId: id,
    balancePaise,
    entries: withBalance,
  });
}
