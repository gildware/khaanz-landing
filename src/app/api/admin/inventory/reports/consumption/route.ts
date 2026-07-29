import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parseIstDateInput } from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const USAGE_TYPES = [
  "POS_OR_WEB_SALE",
  "VENDOR_SALE",
  "WASTAGE",
  "KITCHEN_USE",
  "STOCK_SALE",
] as const;

type UsageType = (typeof USAGE_TYPES)[number];

function emptyBuckets(): Record<UsageType, Prisma.Decimal> {
  return {
    POS_OR_WEB_SALE: new Prisma.Decimal(0),
    VENDOR_SALE: new Prisma.Decimal(0),
    WASTAGE: new Prisma.Decimal(0),
    KITCHEN_USE: new Prisma.Decimal(0),
    STOCK_SALE: new Prisma.Decimal(0),
  };
}

function safeDate(x: string | null): Date | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Daily (or range) stock usage from inventory movements.
 *
 * Prefer `?date=YYYY-MM-DD` (IST calendar day). Or pass `from` + `to` ISO.
 */
export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim() ?? "";
  let from: Date | null = null;
  let toExclusive: Date | null = null;
  let dateLabel: string | null = null;

  if (dateParam) {
    from = parseIstDateInput(dateParam);
    if (!from) {
      return NextResponse.json(
        { error: "date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    toExclusive = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    dateLabel = dateParam;
  } else {
    from = safeDate(url.searchParams.get("from"));
    const toInclusive = safeDate(url.searchParams.get("to"));
    if (!from || !toInclusive) {
      return NextResponse.json(
        {
          error:
            "Pass date=YYYY-MM-DD (IST day) or from & to ISO timestamps",
        },
        { status: 400 },
      );
    }
    toExclusive = new Date(toInclusive.getTime() + 1);
  }

  const prisma = getPrisma();
  const grouped = await prisma.inventoryMovement.groupBy({
    by: ["inventoryItemId", "type"],
    where: {
      occurredAt: { gte: from, lt: toExclusive },
      type: { in: [...USAGE_TYPES] },
    },
    _sum: { qtyDeltaBase: true },
  });

  const byItem = new Map<string, Record<UsageType, Prisma.Decimal>>();
  for (const row of grouped) {
    if (!USAGE_TYPES.includes(row.type as UsageType)) continue;
    const buckets = byItem.get(row.inventoryItemId) ?? emptyBuckets();
    buckets[row.type as UsageType] = (
      row._sum.qtyDeltaBase ?? new Prisma.Decimal(0)
    ).abs();
    byItem.set(row.inventoryItemId, buckets);
  }

  const itemIds = [...byItem.keys()];
  const items =
    itemIds.length === 0
      ? []
      : await prisma.inventoryItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            name: true,
            category: true,
            baseUnit: true,
            purchaseUnit: true,
            baseUnitsPerPurchaseUnit: true,
            avgCostPaisePerBase: true,
          },
        });
  const meta = new Map(items.map((i) => [i.id, i]));

  const rows = [...byItem.entries()].map(([id, buckets]) => {
    const m = meta.get(id);
    const salesQtyBase = buckets.POS_OR_WEB_SALE;
    const vendorSaleQtyBase = buckets.VENDOR_SALE;
    const wastageQtyBase = buckets.WASTAGE;
    const kitchenUseQtyBase = buckets.KITCHEN_USE;
    const stockSaleQtyBase = buckets.STOCK_SALE;
    const totalQtyBase = salesQtyBase
      .add(vendorSaleQtyBase)
      .add(wastageQtyBase)
      .add(kitchenUseQtyBase)
      .add(stockSaleQtyBase);
    const unitCost = m?.avgCostPaisePerBase ?? new Prisma.Decimal(0);
    const estCostPaise = totalQtyBase
      .mul(unitCost)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

    return {
      inventoryItemId: id,
      itemName: m?.name ?? "",
      category: m?.category ?? "",
      baseUnit: m?.baseUnit ?? "",
      purchaseUnit: m?.purchaseUnit ?? "",
      baseUnitsPerPurchaseUnit: m?.baseUnitsPerPurchaseUnit.toString() ?? "1",
      salesQtyBase: salesQtyBase.toString(),
      vendorSaleQtyBase: vendorSaleQtyBase.toString(),
      wastageQtyBase: wastageQtyBase.toString(),
      kitchenUseQtyBase: kitchenUseQtyBase.toString(),
      stockSaleQtyBase: stockSaleQtyBase.toString(),
      totalQtyBase: totalQtyBase.toString(),
      estCostPaise: Number(estCostPaise.toString()),
    };
  });

  rows.sort(
    (a, b) =>
      b.estCostPaise - a.estCostPaise || a.itemName.localeCompare(b.itemName),
  );

  return NextResponse.json({
    date: dateLabel,
    from: from!.toISOString(),
    toExclusive: toExclusive!.toISOString(),
    rows,
  });
}
