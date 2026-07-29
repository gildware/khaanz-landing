import type { Prisma } from "@prisma/client";

import type {
  MenuConsumptionCache,
  RecipeVersionWithIngredients,
} from "@/lib/inventory/consumption-cache";
import { D0, d } from "@/lib/inventory/decimal-utils";
import { applyYieldLinksToConsumption } from "@/lib/inventory/yield-links";

const MAX_RECIPE_NEST_DEPTH = 8;

export type ResolvedRecipe = {
  recipeVersionId: string;
  yieldQty: Prisma.Decimal;
  yieldUnit: string;
  /** Direct inventory lines only (not expanded). */
  ingredients: { inventoryItemId: string; qtyBase: Prisma.Decimal }[];
  /** Nested menu-item lines; qty is in the component recipe's yield unit. */
  components: {
    componentMenuItemId: string;
    componentVariationId: string | null;
    qtyBase: Prisma.Decimal;
  }[];
};

export async function resolveRecipeVersion(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  variationId: string,
  at: Date,
  cache?: MenuConsumptionCache,
): Promise<ResolvedRecipe | null> {
  const chosen = cache
    ? pickRecipeVersion(await cache.versionsFor(tx, menuItemId), variationId, at)
    : await findRecipeVersion(tx, menuItemId, variationId, at);
  if (!chosen) return null;

  const ingredients: ResolvedRecipe["ingredients"] = [];
  const components: ResolvedRecipe["components"] = [];
  for (const i of chosen.ingredients) {
    if (i.inventoryItemId) {
      ingredients.push({
        inventoryItemId: i.inventoryItemId,
        qtyBase: i.qtyBase,
      });
    } else if (i.componentMenuItemId) {
      components.push({
        componentMenuItemId: i.componentMenuItemId,
        componentVariationId: i.componentVariationId,
        qtyBase: i.qtyBase,
      });
    }
  }

  return {
    recipeVersionId: chosen.id,
    yieldQty: chosen.yieldQty.greaterThan(0) ? chosen.yieldQty : d(1),
    yieldUnit: chosen.yieldUnit ?? "",
    ingredients,
    components,
  };
}

/** Latest version effective at `at`, preferring the variation-specific recipe. */
function pickRecipeVersion(
  versions: RecipeVersionWithIngredients[],
  variationId: string,
  at: Date,
): RecipeVersionWithIngredients | null {
  const effective = versions.filter((v) => v.effectiveFrom.getTime() <= at.getTime());
  return (
    effective.find((v) => v.variationId === variationId) ??
    effective.find((v) => v.variationId === null) ??
    null
  );
}

async function findRecipeVersion(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  variationId: string,
  at: Date,
): Promise<RecipeVersionWithIngredients | null> {
  const specific = await tx.recipeVersion.findFirst({
    where: {
      menuItemId,
      variationId,
      effectiveFrom: { lte: at },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { ingredients: true },
  });
  if (specific) return specific;

  return tx.recipeVersion.findFirst({
    where: {
      menuItemId,
      variationId: null,
      effectiveFrom: { lte: at },
    },
    orderBy: { effectiveFrom: "desc" },
    include: { ingredients: true },
  });
}

/** Scale direct inventory lines only (ignores nested components). Prefer expandMenuItemConsumption. */
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

/**
 * Expand a menu item (and nested menu-item recipe components) into inventory qty.
 * Nested qty is interpreted in the child recipe's yield unit:
 * childPortions = parentPortions × nestedQty / childYield.
 */
export async function expandMenuItemConsumption(
  tx: Prisma.TransactionClient,
  menuItemId: string,
  variationId: string,
  at: Date,
  portions: Prisma.Decimal,
  stack: string[] = [],
  cache?: MenuConsumptionCache,
): Promise<Map<string, Prisma.Decimal>> {
  const totals = new Map<string, Prisma.Decimal>();
  if (!portions.greaterThan(0)) return totals;
  if (stack.length >= MAX_RECIPE_NEST_DEPTH) return totals;
  if (stack.includes(menuItemId)) return totals;

  const recipe = await resolveRecipeVersion(tx, menuItemId, variationId, at, cache);
  if (!recipe) return totals;

  mergeConsumption(totals, scaleRecipe(recipe, portions));

  const nextStack = [...stack, menuItemId];
  for (const comp of recipe.components) {
    if (nextStack.includes(comp.componentMenuItemId)) continue;

    const child = await resolveRecipeVersion(
      tx,
      comp.componentMenuItemId,
      comp.componentVariationId ?? "",
      at,
      cache,
    );
    if (!child) continue;

    const childYield = child.yieldQty.greaterThan(0) ? child.yieldQty : d(1);
    const childPortions = portions.mul(comp.qtyBase).div(childYield);
    if (!childPortions.greaterThan(0)) continue;

    const nested = await expandMenuItemConsumption(
      tx,
      comp.componentMenuItemId,
      comp.componentVariationId ?? "",
      at,
      childPortions,
      nextStack,
      cache,
    );
    mergeConsumption(totals, nested);
  }

  // Only rewrite at the top-level expand so nested passes do not double-apply.
  if (stack.length === 0) {
    return applyYieldLinksToConsumption(tx, totals, cache);
  }
  return totals;
}

export function recipeHasConsumableLines(recipe: ResolvedRecipe): boolean {
  return recipe.ingredients.length > 0 || recipe.components.length > 0;
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
