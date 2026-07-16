import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { d } from "@/lib/inventory/decimal-utils";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordStockSale } from "@/lib/inventory/stock-ops";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    500,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "100"))),
  );

  const soldAt: { gte?: Date; lt?: Date } = {};
  if (from) {
    const date = new Date(from);
    if (!Number.isNaN(date.getTime())) soldAt.gte = date;
  }
  if (to) {
    const date = new Date(to);
    if (!Number.isNaN(date.getTime())) soldAt.lt = date;
  }

  const prisma = getPrisma();
  const entries = await prisma.stockSaleEntry.findMany({
    where: Object.keys(soldAt).length ? { soldAt } : {},
    orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      inventoryItemId: true,
      soldAt: true,
      qtyBase: true,
      ratePaisePerBase: true,
      totalPaise: true,
      costPaise: true,
      buyerName: true,
      note: true,
      createdAt: true,
      item: { select: { name: true, baseUnit: true } },
    },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      inventoryItemId: e.inventoryItemId,
      soldAt: e.soldAt.toISOString(),
      qtyBase: e.qtyBase.toString(),
      ratePaisePerBase: e.ratePaisePerBase.toString(),
      totalPaise: e.totalPaise,
      costPaise: e.costPaise,
      buyerName: e.buyerName,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      item: e.item,
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

  const inventoryItemId =
    typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
  if (!inventoryItemId) {
    return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
  }
  const qty = parseDecimalQty(body.qtyBase, "qtyBase");
  if ("error" in qty) {
    return NextResponse.json({ error: qty.error }, { status: 400 });
  }

  let ratePaisePerBase: Prisma.Decimal;
  if (typeof body.ratePaisePerBase === "number" && Number.isFinite(body.ratePaisePerBase)) {
    ratePaisePerBase = d(body.ratePaisePerBase);
  } else if (typeof body.ratePaisePerBase === "string" && body.ratePaisePerBase.trim()) {
    try {
      ratePaisePerBase = d(body.ratePaisePerBase.trim());
    } catch {
      return NextResponse.json({ error: "Invalid ratePaisePerBase" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "ratePaisePerBase required" }, { status: 400 });
  }
  if (ratePaisePerBase.lessThan(0)) {
    return NextResponse.json({ error: "ratePaisePerBase must be ≥ 0" }, { status: 400 });
  }

  const soldAt =
    typeof body.soldAt === "string" && body.soldAt
      ? new Date(body.soldAt)
      : new Date();
  if (Number.isNaN(soldAt.getTime())) {
    return NextResponse.json({ error: "Invalid soldAt" }, { status: 400 });
  }
  const buyerName = typeof body.buyerName === "string" ? body.buyerName : "";
  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const settings = await ensureInventorySettings(tx);
      return await recordStockSale(tx, {
        allowNegativeStock: settings.allowNegativeStock,
        inventoryItemId,
        qtyBase: qty,
        ratePaisePerBase,
        soldAt,
        buyerName,
        note,
        createdByUserId: session.userId,
      });
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
