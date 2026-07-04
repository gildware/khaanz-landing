import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseIngredients(
  ingRaw: unknown,
):
  | { error: string; status: number }
  | { inventoryItemId: string; qtyBase: Prisma.Decimal }[] {
  if (!Array.isArray(ingRaw) || ingRaw.length === 0) {
    return { error: "ingredients[] required", status: 400 };
  }
  const ingredients: { inventoryItemId: string; qtyBase: Prisma.Decimal }[] = [];
  for (const raw of ingRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const inventoryItemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    if (!inventoryItemId) {
      return { error: "ingredient inventoryItemId", status: 400 };
    }
    const q = parseDecimalQty(o.qtyBase, "qtyBase");
    if ("error" in q) {
      return { error: q.error, status: 400 };
    }
    if (!q.greaterThan(0)) {
      return { error: "qtyBase must be > 0", status: 400 };
    }
    ingredients.push({ inventoryItemId, qtyBase: q });
  }
  if (ingredients.length === 0) {
    return { error: "ingredients[] required", status: 400 };
  }
  return ingredients;
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

  const ingredients = parseIngredients(body.ingredients);
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

  const version = await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeVersionId: id } });
    return tx.recipeVersion.update({
      where: { id },
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
