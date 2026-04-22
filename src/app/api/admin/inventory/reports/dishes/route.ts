import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { computeDishCostBreakdown, marginPercentPaise } from "@/lib/inventory/dish-cost";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const atStr = url.searchParams.get("at");
  const at = atStr ? new Date(atStr) : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid at" }, { status: 400 });
  }

  const prisma = getPrisma();
  const items = await prisma.menuItem.findMany({
    where: { available: true },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { variations: { orderBy: { sortOrder: "asc" } } },
  });

  const rows = await prisma.$transaction(async (tx) => {
    const out: {
      menuItemId: string;
      menuItemName: string;
      variationId: string;
      variationName: string;
      sellingPricePaise: number;
      recipeCostPaise: string | null;
      marginPct: number | null;
    }[] = [];

    for (const it of items) {
      for (const v of it.variations) {
        const sellingPricePaise = Math.round(v.price * 100);
        const breakdown = await computeDishCostBreakdown(tx, it.id, v.id, at);
        out.push({
          menuItemId: it.id,
          menuItemName: it.name,
          variationId: v.id,
          variationName: v.name,
          sellingPricePaise,
          recipeCostPaise: breakdown ? breakdown.costPaise.toString() : null,
          marginPct: breakdown ? marginPercentPaise(sellingPricePaise, breakdown.costPaise) : null,
        });
      }
    }
    return out;
  });

  return NextResponse.json({ at: at.toISOString(), rows });
}

