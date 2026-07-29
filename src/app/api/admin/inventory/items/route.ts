import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { costPaisePerBaseFromPurchaseRate } from "@/lib/inventory/inventory-costing";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import {
  parseYieldLinkInput,
  serializeYieldLink,
} from "@/lib/inventory/yield-links";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const itemSelect = {
  id: true,
  name: true,
  category: true,
  baseUnit: true,
  purchaseUnit: true,
  baseUnitsPerPurchaseUnit: true,
  stockOnHandBase: true,
  minStockBase: true,
  avgCostPaisePerBase: true,
  lastPurchasePaisePerBase: true,
  active: true,
  yieldSourceItemId: true,
  yieldPercent: true,
  yieldSourceItem: { select: { id: true, name: true } },
} as const;

function serializeItem(
  r: {
    id: string;
    name: string;
    category: string;
    baseUnit: string;
    purchaseUnit: string;
    baseUnitsPerPurchaseUnit: { toString(): string };
    stockOnHandBase: { toString(): string };
    minStockBase: { toString(): string };
    avgCostPaisePerBase: { toString(): string };
    lastPurchasePaisePerBase: { toString(): string };
    active: boolean;
    yieldSourceItemId: string | null;
    yieldPercent: { toString(): string } | null;
    yieldSourceItem: { id: string; name: string } | null;
  },
) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    baseUnit: r.baseUnit,
    purchaseUnit: r.purchaseUnit,
    baseUnitsPerPurchaseUnit: r.baseUnitsPerPurchaseUnit.toString(),
    stockOnHandBase: r.stockOnHandBase.toString(),
    minStockBase: r.minStockBase.toString(),
    avgCostPaisePerBase: r.avgCostPaisePerBase.toString(),
    lastPurchasePaisePerBase: r.lastPurchasePaisePerBase.toString(),
    active: r.active,
    yieldLink: serializeYieldLink(r),
  };
}

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrisma();
  const rows = await prisma.inventoryItem.findMany({
    select: itemSelect,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items: rows.map(serializeItem) });
}

export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const baseUnit =
    typeof body.baseUnit === "string" ? body.baseUnit.trim().slice(0, 32) : "";
  const purchaseUnit =
    typeof body.purchaseUnit === "string"
      ? body.purchaseUnit.trim().slice(0, 32)
      : "";
  if (!baseUnit || !purchaseUnit) {
    return NextResponse.json(
      { error: "baseUnit and purchaseUnit are required" },
      { status: 400 },
    );
  }

  const conv = parseDecimalQty(body.baseUnitsPerPurchaseUnit, "baseUnitsPerPurchaseUnit");
  if ("error" in conv) {
    return NextResponse.json({ error: conv.error }, { status: 400 });
  }
  if (!conv.greaterThan(0)) {
    return NextResponse.json(
      { error: "baseUnitsPerPurchaseUnit must be > 0" },
      { status: 400 },
    );
  }

  const minB = parseDecimalQty(body.minStockBase ?? "0", "minStockBase");
  if ("error" in minB) {
    return NextResponse.json({ error: minB.error }, { status: 400 });
  }

  const category =
    typeof body.category === "string" ? body.category.trim().slice(0, 120) : "";

  let unitCostPaisePerBase: ReturnType<typeof costPaisePerBaseFromPurchaseRate> | null =
    null;
  if (
    body.ratePaisePerPurchaseUnit !== undefined &&
    body.ratePaisePerPurchaseUnit !== null &&
    body.ratePaisePerPurchaseUnit !== ""
  ) {
    const rate = Number(body.ratePaisePerPurchaseUnit);
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json(
        { error: "ratePaisePerPurchaseUnit must be a non-negative number" },
        { status: 400 },
      );
    }
    unitCostPaisePerBase = costPaisePerBaseFromPurchaseRate(Math.floor(rate), conv);
  }

  const yieldParsed = parseYieldLinkInput(body);
  if ("error" in yieldParsed) {
    return NextResponse.json({ error: yieldParsed.error }, { status: 400 });
  }

  const prisma = getPrisma();

  let yieldData: {
    yieldSourceItemId: string | null;
    yieldPercent: number | null;
  } | null = null;
  if ("clear" in yieldParsed) {
    yieldData = { yieldSourceItemId: null, yieldPercent: null };
  } else if ("sourceItemId" in yieldParsed) {
    const source = await prisma.inventoryItem.findUnique({
      where: { id: yieldParsed.sourceItemId },
      select: { id: true },
    });
    if (!source) {
      return NextResponse.json(
        { error: "Yield source item not found" },
        { status: 400 },
      );
    }
    yieldData = {
      yieldSourceItemId: yieldParsed.sourceItemId,
      yieldPercent: yieldParsed.yieldPercent,
    };
  }

  const row = await prisma.inventoryItem.create({
    data: {
      name: name.slice(0, 200),
      category,
      baseUnit,
      purchaseUnit,
      baseUnitsPerPurchaseUnit: conv,
      minStockBase: minB,
      ...(unitCostPaisePerBase !== null
        ? {
            avgCostPaisePerBase: unitCostPaisePerBase,
            lastPurchasePaisePerBase: unitCostPaisePerBase,
          }
        : {}),
      ...(yieldData ?? {}),
    },
    select: itemSelect,
  });

  return NextResponse.json(serializeItem(row));
}
