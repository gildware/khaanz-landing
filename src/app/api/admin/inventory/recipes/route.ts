import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { computeDishCostBreakdown } from "@/lib/inventory/dish-cost";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const menuItemId = url.searchParams.get("menuItemId")?.trim() ?? "";
  const variationId = url.searchParams.get("variationId")?.trim() ?? "";
  const costPreview = url.searchParams.get("cost") === "1";

  const prisma = getPrisma();

  if (costPreview && menuItemId && variationId) {
    const at = new Date();
    const breakdown = await prisma.$transaction((tx) =>
      computeDishCostBreakdown(tx, menuItemId, variationId, at),
    );
    return NextResponse.json({
      dishCostPaise: breakdown?.costPaise.toString() ?? null,
      lines: breakdown?.lines ?? [],
    });
  }
  const rows = await prisma.recipeVersion.findMany({
    where: menuItemId ? { menuItemId } : {},
    orderBy: [{ menuItemId: "asc" }, { effectiveFrom: "desc" }],
    include: {
      ingredients: true,
      menuItem: { select: { id: true, name: true } },
    },
    take: menuItemId ? 50 : 200,
  });

  return NextResponse.json({
    recipes: rows.map((r) => ({
      id: r.id,
      menuItemId: r.menuItemId,
      menuItemName: r.menuItem.name,
      variationId: r.variationId,
      effectiveFrom: r.effectiveFrom.toISOString(),
      label: r.label,
      ingredients: r.ingredients.map((i) => ({
        inventoryItemId: i.inventoryItemId,
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

  const menuItemId =
    typeof body.menuItemId === "string" ? body.menuItemId.trim() : "";
  if (!menuItemId) {
    return NextResponse.json({ error: "menuItemId required" }, { status: 400 });
  }
  const variationIdRaw = body.variationId;
  const variationId =
    variationIdRaw === null || variationIdRaw === undefined
      ? null
      : typeof variationIdRaw === "string"
        ? variationIdRaw.trim().slice(0, 64) || null
        : null;

  const effectiveFrom =
    typeof body.effectiveFrom === "string" && body.effectiveFrom
      ? new Date(body.effectiveFrom)
      : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) {
    return NextResponse.json({ error: "Invalid effectiveFrom" }, { status: 400 });
  }
  const label =
    typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";

  const ingRaw = body.ingredients;
  if (!Array.isArray(ingRaw) || ingRaw.length === 0) {
    return NextResponse.json({ error: "ingredients[] required" }, { status: 400 });
  }

  const prisma = getPrisma();
  const menu = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!menu) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }

  const ingredients: { inventoryItemId: string; qtyBase: Prisma.Decimal }[] = [];
  for (const raw of ingRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const inventoryItemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    if (!inventoryItemId) {
      return NextResponse.json({ error: "ingredient inventoryItemId" }, { status: 400 });
    }
    const q = parseDecimalQty(o.qtyBase, "qtyBase");
    if ("error" in q) {
      return NextResponse.json({ error: q.error }, { status: 400 });
    }
    if (!q.greaterThan(0)) {
      return NextResponse.json({ error: "qtyBase must be > 0" }, { status: 400 });
    }
    ingredients.push({ inventoryItemId, qtyBase: q });
  }

  const version = await prisma.recipeVersion.create({
    data: {
      menuItemId,
      variationId,
      effectiveFrom,
      label,
      ingredients: {
        create: ingredients.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          qtyBase: i.qtyBase,
        })),
      },
    },
    include: { ingredients: true },
  });

  return NextResponse.json({
    id: version.id,
    menuItemId: version.menuItemId,
    variationId: version.variationId,
    effectiveFrom: version.effectiveFrom.toISOString(),
    ingredients: version.ingredients.map((i) => ({
      inventoryItemId: i.inventoryItemId,
      qtyBase: i.qtyBase.toString(),
    })),
  });
}
