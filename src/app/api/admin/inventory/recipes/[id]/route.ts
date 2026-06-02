import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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
