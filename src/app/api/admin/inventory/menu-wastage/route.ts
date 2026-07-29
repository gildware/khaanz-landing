import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { recordMenuWastage } from "@/lib/inventory/menu-wastage";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import {
  isFutureWastedAt,
  isWastageType,
  resolveWastedAt,
} from "@/lib/inventory/wastage-parse";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "50"))),
  );

  const prisma = getPrisma();
  const entries = await prisma.menuWastageEntry.findMany({
    orderBy: [{ wastedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      quantity: true,
      wastedAt: true,
      wastageType: true,
      note: true,
      createdAt: true,
      menuItem: { select: { name: true } },
      variation: { select: { name: true } },
      ingredients: {
        select: {
          id: true,
          qtyBase: true,
          item: { select: { name: true, baseUnit: true } },
        },
      },
    },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      dishName: e.menuItem.name,
      variationName: e.variation.name,
      quantity: e.quantity.toString(),
      wastedAt: e.wastedAt.toISOString(),
      wastageType: e.wastageType,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      ingredients: e.ingredients.map((i) => ({
        id: i.id,
        itemName: i.item.name,
        baseUnit: i.item.baseUnit,
        qtyBase: i.qtyBase.toString(),
      })),
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

  if (!isWastageType(body.wastageType)) {
    return NextResponse.json({ error: "Invalid wastageType" }, { status: 400 });
  }
  const wastageType = body.wastageType;

  const menuItemId =
    typeof body.menuItemId === "string" ? body.menuItemId.trim() : "";
  const variationId =
    typeof body.variationId === "string" ? body.variationId.trim() : "";
  if (!menuItemId || !variationId) {
    return NextResponse.json(
      { error: "menuItemId and variationId required" },
      { status: 400 },
    );
  }

  const qty = parseDecimalQty(body.quantity ?? body.qtyBase, "quantity");
  if ("error" in qty) {
    return NextResponse.json({ error: qty.error }, { status: 400 });
  }

  const wastedAt = resolveWastedAt(body.wastedAt);
  if (!wastedAt) {
    return NextResponse.json({ error: "Invalid wastedAt" }, { status: 400 });
  }
  if (isFutureWastedAt(wastedAt)) {
    return NextResponse.json(
      { error: "Waste date can’t be in the future" },
      { status: 400 },
    );
  }

  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const settings = await ensureInventorySettings(tx);
      return await recordMenuWastage(tx, {
        allowNegativeStock: settings.allowNegativeStock,
        menuItemId,
        variationId,
        quantity: qty,
        wastedAt,
        wastageType,
        note,
        createdByUserId: session.userId,
      });
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    const status =
      msg === "RECIPE_NOT_FOUND" || msg === "RECIPE_HAS_NO_INGREDIENTS"
        ? 422
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
