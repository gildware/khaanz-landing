import type { Prisma } from "@prisma/client";

import { D0, d } from "@/lib/inventory/decimal-utils";

export type ResolvedRecipe = {
  recipeVersionId: string;
  ingredients: { inventoryItemId: string; qtyBase: Prisma.Decimal }[];
};

export async function resolveRecipeVersion(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  variationId: string,
  at: Date,
): Promise<ResolvedRecipe | null> {
  const specific = await tx.recipeVersion.findFirst({
    where: {
      menuItemId,
      variationId,
      effectiveFrom: { lte: at },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { ingredients: true },
  });
  const chosen = specific
    ? specific
    : await tx.recipeVersion.findFirst({
        where: {
          menuItemId,
          variationId: null,
          effectiveFrom: { lte: at },
        },
        orderBy: { effectiveFrom: "desc" },
        include: { ingredients: true },
      });
  if (!chosen) return null;
  return {
    recipeVersionId: chosen.id,
    ingredients: chosen.ingredients.map((i) => ({
      inventoryItemId: i.inventoryItemId,
      qtyBase: i.qtyBase,
    })),
  };
}

export function scaleRecipe(
  recipe: ResolvedRecipe,
  portions: Prisma.Decimal,
): Map<string, Prisma.Decimal> {
  const out = new Map<string, Prisma.Decimal>();
  for (const ing of recipe.ingredients) {
    const add = ing.qtyBase.mul(portions);
    const prev = out.get(ing.inventoryItemId) ?? D0;
    out.set(ing.inventoryItemId, prev.add(add));
  }
  return out;
}

export function mergeConsumption(
  target: Map<string, Prisma.Decimal>,
  add: Map<string, Prisma.Decimal>,
): void {
  for (const [k, v] of add) {
    const prev = target.get(k) ?? D0;
    target.set(k, prev.add(v));
  }
}

export function negateConsumption(
  m: Map<string, Prisma.Decimal>,
): Map<string, Prisma.Decimal> {
  const out = new Map<string, Prisma.Decimal>();
  for (const [k, v] of m) {
    out.set(k, d(0).sub(v));
  }
  return out;
}
