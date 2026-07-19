import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import {
  assertNoRecipeComponentCycles,
  parseRecipeIngredients,
  parseRecipeYield,
  toRecipeIngredientCreates,
} from "@/lib/inventory/parse-recipe-ingredients";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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
  const existing = await prisma.recipeVersion.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

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

  const version = await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeVersionId: id } });
    return tx.recipeVersion.update({
      where: { id },
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
  const existing = await prisma.recipeVersion.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // RecipeIngredient rows cascade-delete with the version. Recipes are not
  // referenced by a foreign key from orders (consumption is resolved at order
  // time), so deleting a version only affects future order costing/deduction.
  await prisma.recipeVersion.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
