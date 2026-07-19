import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { computeDishCostBreakdown } from "@/lib/inventory/dish-cost";
import {
  assertNoRecipeComponentCycles,
  parseRecipeIngredients,
  parseRecipeYield,
  toRecipeIngredientCreates,
} from "@/lib/inventory/parse-recipe-ingredients";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function serializeIngredient(i: {
  inventoryItemId: string | null;
  componentMenuItemId: string | null;
  componentVariationId: string | null;
  qtyBase: { toString(): string };
  componentMenuItem?: { name: string } | null;
}) {
  if (i.componentMenuItemId) {
    return {
      kind: "menu_item" as const,
      componentMenuItemId: i.componentMenuItemId,
      componentMenuItemName: i.componentMenuItem?.name ?? "",
      componentVariationId: i.componentVariationId,
      qtyBase: i.qtyBase.toString(),
    };
  }
  return {
    kind: "inventory" as const,
    inventoryItemId: i.inventoryItemId!,
    qtyBase: i.qtyBase.toString(),
  };
}

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
      ingredients: {
        include: {
          componentMenuItem: { select: { id: true, name: true } },
        },
      },
      menuItem: { select: { id: true, name: true } },
    },
    take: menuItemId ? 50 : 200,
  });

  // Version numbers are chronological per menu item + variation (v1 = oldest).
  const versionById = new Map<string, number>();
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.menuItemId}\0${r.variationId ?? ""}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => {
      const t = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
      if (t !== 0) return t;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    list.forEach((r, i) => versionById.set(r.id, i + 1));
  }

  return NextResponse.json({
    recipes: rows.map((r) => ({
      id: r.id,
      menuItemId: r.menuItemId,
      menuItemName: r.menuItem.name,
      variationId: r.variationId,
      effectiveFrom: r.effectiveFrom.toISOString(),
      label: r.label,
      yieldQty: r.yieldQty.toString(),
      yieldUnit: r.yieldUnit,
      version: versionById.get(r.id) ?? 1,
      ingredients: r.ingredients.map(serializeIngredient),
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

  const yieldParsed = parseRecipeYield(body);
  if ("error" in yieldParsed) {
    return NextResponse.json({ error: yieldParsed.error }, { status: 400 });
  }

  const ingredients = parseRecipeIngredients(body.ingredients);
  if ("error" in ingredients) {
    return NextResponse.json(
      { error: ingredients.error },
      { status: ingredients.status },
    );
  }

  const prisma = getPrisma();
  const menu = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!menu) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }

  const inventoryIds = ingredients
    .filter((i) => i.kind === "inventory")
    .map((i) => i.inventoryItemId);
  if (inventoryIds.length > 0) {
    const found = await prisma.inventoryItem.findMany({
      where: { id: { in: inventoryIds }, active: true },
      select: { id: true },
    });
    if (found.length !== new Set(inventoryIds).size) {
      return NextResponse.json(
        { error: "One or more inventory items not found" },
        { status: 400 },
      );
    }
  }

  const componentIds = ingredients
    .filter((i) => i.kind === "menu_item")
    .map((i) => i.componentMenuItemId);
  if (componentIds.length > 0) {
    const found = await prisma.menuItem.findMany({
      where: { id: { in: componentIds } },
      select: { id: true },
    });
    if (found.length !== new Set(componentIds).size) {
      return NextResponse.json(
        { error: "One or more component menu items not found" },
        { status: 400 },
      );
    }
  }

  const cycle = await prisma.$transaction((tx) =>
    assertNoRecipeComponentCycles(
      tx,
      menuItemId,
      ingredients
        .filter((i) => i.kind === "menu_item")
        .map((i) => ({ componentMenuItemId: i.componentMenuItemId })),
    ),
  );
  if (cycle) {
    return NextResponse.json({ error: cycle.error }, { status: 400 });
  }

  const version = await prisma.recipeVersion.create({
    data: {
      menuItemId,
      variationId,
      effectiveFrom,
      label,
      yieldQty: yieldParsed.yieldQty,
      yieldUnit: yieldParsed.yieldUnit,
      ingredients: {
        create: toRecipeIngredientCreates(ingredients),
      },
    },
    include: {
      ingredients: {
        include: {
          componentMenuItem: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    id: version.id,
    menuItemId: version.menuItemId,
    variationId: version.variationId,
    effectiveFrom: version.effectiveFrom.toISOString(),
    yieldQty: version.yieldQty.toString(),
    yieldUnit: version.yieldUnit,
    ingredients: version.ingredients.map(serializeIngredient),
  });
}
