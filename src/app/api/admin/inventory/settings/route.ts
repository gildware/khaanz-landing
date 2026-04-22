import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { getPrisma } from "@/lib/prisma";
import type { InventoryCostingMethod } from "@prisma/client";

export const runtime = "nodejs";

const METHODS: InventoryCostingMethod[] = [
  "WEIGHTED_AVERAGE",
  "LATEST_PURCHASE",
];

function isCostingMethod(x: unknown): x is InventoryCostingMethod {
  return typeof x === "string" && METHODS.includes(x as InventoryCostingMethod);
}

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrisma();
  const row = await ensureInventorySettings(prisma);
  return NextResponse.json(row);
}

export async function PATCH(request: Request) {
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

  const data: {
    costingMethod?: InventoryCostingMethod;
    restoreStockOnCancel?: boolean;
    allowNegativeStock?: boolean;
  } = {};

  if (body.costingMethod !== undefined) {
    if (!isCostingMethod(body.costingMethod)) {
      return NextResponse.json({ error: "Invalid costing method" }, { status: 400 });
    }
    data.costingMethod = body.costingMethod;
  }
  if (typeof body.restoreStockOnCancel === "boolean") {
    data.restoreStockOnCancel = body.restoreStockOnCancel;
  }
  if (typeof body.allowNegativeStock === "boolean") {
    data.allowNegativeStock = body.allowNegativeStock;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const prisma = getPrisma();
  const row = await prisma.inventorySettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  return NextResponse.json({
    costingMethod: row.costingMethod,
    restoreStockOnCancel: row.restoreStockOnCancel,
    allowNegativeStock: row.allowNegativeStock,
  });
}
