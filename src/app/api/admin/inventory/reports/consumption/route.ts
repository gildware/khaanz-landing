import { Prisma } from "@prisma/client";
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
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to query params required (ISO dates)" },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  const sales = await prisma.inventoryMovement.groupBy({
    by: ["inventoryItemId"],
    where: {
      occurredAt: { gte: from, lte: to },
      type: "POS_OR_WEB_SALE",
    },
    _sum: { qtyDeltaBase: true },
  });

  const wastage = await prisma.inventoryMovement.groupBy({
    by: ["inventoryItemId"],
    where: {
      occurredAt: { gte: from, lte: to },
      type: "WASTAGE",
    },
    _sum: { qtyDeltaBase: true },
  });

  const byItem = new Map<
    string,
    { salesBase: Prisma.Decimal; wastageBase: Prisma.Decimal }
  >();

  for (const s of sales) {
    byItem.set(s.inventoryItemId, {
      salesBase: s._sum.qtyDeltaBase ?? new Prisma.Decimal(0),
      wastageBase: new Prisma.Decimal(0),
    });
  }
  for (const w of wastage) {
    const prev = byItem.get(w.inventoryItemId) ?? {
      salesBase: new Prisma.Decimal(0),
      wastageBase: new Prisma.Decimal(0),
    };
    byItem.set(w.inventoryItemId, {
      salesBase: prev.salesBase,
      wastageBase: w._sum.qtyDeltaBase ?? new Prisma.Decimal(0),
    });
  }

  const itemIds = [...byItem.keys()];
  const items =
    itemIds.length === 0
      ? []
      : await prisma.inventoryItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, baseUnit: true },
        });
  const meta = new Map(items.map((i) => [i.id, i]));

  const rows = [...byItem.entries()].map(([id, v]) => {
    const m = meta.get(id);
    // qtyDeltaBase is negative for OUT movements
    const salesOut = v.salesBase.abs();
    const wastageOut = v.wastageBase.abs();
    return {
      inventoryItemId: id,
      itemName: m?.name ?? "",
      baseUnit: m?.baseUnit ?? "",
      soldQtyBase: salesOut.toString(),
      wastedQtyBase: wastageOut.toString(),
      totalConsumedQtyBase: salesOut.add(wastageOut).toString(),
    };
  });

  rows.sort((a, b) => a.itemName.localeCompare(b.itemName));

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
  });
}

