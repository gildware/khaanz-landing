import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { costPaisePerBaseFromPurchaseRate } from "@/lib/inventory/inventory-costing";
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

  const prisma = getPrisma();

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
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    const conv =
      data.baseUnitsPerPurchaseUnit !== undefined
        ? (data.baseUnitsPerPurchaseUnit as typeof existing.baseUnitsPerPurchaseUnit)
        : existing.baseUnitsPerPurchaseUnit;
    const unitCost = costPaisePerBaseFromPurchaseRate(Math.floor(rate), conv);
    data.avgCostPaisePerBase = unitCost;
    data.lastPurchasePaisePerBase = unitCost;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

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
      avgCostPaisePerBase: row.avgCostPaisePerBase.toString(),
      lastPurchasePaisePerBase: row.lastPurchasePaisePerBase.toString(),
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

  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Count every record that references this item. The schema uses
  // onDelete: Restrict, so a hard delete is only possible when there is no
  // linked history. Otherwise we archive (deactivate) to preserve records.
  const [
    purchaseLines,
    returnLines,
    batches,
    movements,
    batchConsumptions,
    recipeIngredients,
    wastageRows,
    stockAdjustments,
    stockAuditLines,
    personalUseEntries,
  ] = await Promise.all([
    prisma.purchaseLine.count({ where: { inventoryItemId: id } }),
    prisma.purchaseReturnLine.count({ where: { inventoryItemId: id } }),
    prisma.inventoryBatch.count({ where: { inventoryItemId: id } }),
    prisma.inventoryMovement.count({ where: { inventoryItemId: id } }),
    prisma.inventoryBatchConsumption.count({ where: { inventoryItemId: id } }),
    prisma.recipeIngredient.count({ where: { inventoryItemId: id } }),
    prisma.wastageEntry.count({ where: { inventoryItemId: id } }),
    prisma.stockAdjustment.count({ where: { inventoryItemId: id } }),
    prisma.stockAuditLine.count({ where: { inventoryItemId: id } }),
    prisma.personalUseEntry.count({ where: { inventoryItemId: id } }),
  ]);

  const linkedCount =
    purchaseLines +
    returnLines +
    batches +
    movements +
    batchConsumptions +
    recipeIngredients +
    wastageRows +
    stockAdjustments +
    stockAuditLines +
    personalUseEntries;

  if (linkedCount === 0) {
    await prisma.inventoryItem.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  await prisma.inventoryItem.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({
    ok: true,
    deleted: false,
    archived: true,
    linkedRecords: {
      purchaseLines,
      returnLines,
      batches,
      movements,
      batchConsumptions,
      recipeIngredients,
      wastageRows,
      stockAdjustments,
      stockAuditLines,
      personalUseEntries,
    },
  });
}
