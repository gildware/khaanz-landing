import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

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
  if (typeof body.category === "string") {
    data.category = body.category.trim().slice(0, 120);
  }
  if (typeof body.baseUnit === "string" && body.baseUnit.trim()) {
    data.baseUnit = body.baseUnit.trim().slice(0, 32);
  }
  if (typeof body.purchaseUnit === "string" && body.purchaseUnit.trim()) {
    data.purchaseUnit = body.purchaseUnit.trim().slice(0, 32);
  }
  if (body.baseUnitsPerPurchaseUnit !== undefined) {
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
    data.baseUnitsPerPurchaseUnit = conv;
  }
  if (body.minStockBase !== undefined) {
    const m = parseDecimalQty(body.minStockBase, "minStockBase");
    if ("error" in m) {
      return NextResponse.json({ error: m.error }, { status: 400 });
    }
    data.minStockBase = m;
  }
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    const row = await prisma.inventoryItem.update({
      where: { id },
      data,
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
      active: row.active,
    });
  } catch {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
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
  await prisma.inventoryItem.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
