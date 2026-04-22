import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrisma();
  const rows = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    items: rows.map((r) => ({
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
    })),
  });
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

  const prisma = getPrisma();
  const row = await prisma.inventoryItem.create({
    data: {
      name: name.slice(0, 200),
      category,
      baseUnit,
      purchaseUnit,
      baseUnitsPerPurchaseUnit: conv,
      minStockBase: minB,
    },
  });

  return NextResponse.json({
    id: row.id,
    name: row.name,
    category: row.category,
    baseUnit: row.baseUnit,
    purchaseUnit: row.purchaseUnit,
    baseUnitsPerPurchaseUnit: row.baseUnitsPerPurchaseUnit.toString(),
    stockOnHandBase: row.stockOnHandBase.toString(),
    minStockBase: row.minStockBase.toString(),
  });
}
