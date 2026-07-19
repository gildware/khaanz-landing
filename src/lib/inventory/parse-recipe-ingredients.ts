import type { Prisma } from "@prisma/client";

import { d } from "@/lib/inventory/decimal-utils";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";

export type ParsedRecipeIngredient =
  | {
      kind: "inventory";
      inventoryItemId: string;
      qtyBase: Prisma.Decimal;
    }
  | {
      kind: "menu_item";
      componentMenuItemId: string;
      componentVariationId: string | null;
      qtyBase: Prisma.Decimal;
    };

export type ParsedRecipeYield = {
  yieldQty: Prisma.Decimal;
  yieldUnit: string;
};

export function parseRecipeYield(body: Record<string, unknown>): ParsedRecipeYield | { error: string } {
  const yieldUnit =
    typeof body.yieldUnit === "string" ? body.yieldUnit.trim().slice(0, 32) : "";

  if (body.yieldQty === undefined || body.yieldQty === null || body.yieldQty === "") {
    return { yieldQty: d(1), yieldUnit };
  }

  const q = parseDecimalQty(body.yieldQty, "yieldQty");
  if ("error" in q) return { error: q.error };
  if (!q.greaterThan(0)) return { error: "yieldQty must be > 0" };
  return { yieldQty: q, yieldUnit };
}

export function parseRecipeIngredients(
  ingRaw: unknown,
): { error: string; status: number } | ParsedRecipeIngredient[] {
  if (!Array.isArray(ingRaw) || ingRaw.length === 0) {
    return { error: "ingredients[] required", status: 400 };
  }

  const ingredients: ParsedRecipeIngredient[] = [];
  const seenInventory = new Set<string>();
  const seenComponents = new Set<string>();

  for (const raw of ingRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;

    const inventoryItemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    const componentMenuItemId =
      typeof o.componentMenuItemId === "string"
        ? o.componentMenuItemId.trim()
        : "";
    const componentVariationIdRaw = o.componentVariationId;
    const componentVariationId =
      componentVariationIdRaw === null ||
      componentVariationIdRaw === undefined ||
      componentVariationIdRaw === ""
        ? null
        : typeof componentVariationIdRaw === "string"
          ? componentVariationIdRaw.trim().slice(0, 64) || null
          : null;

    const q = parseDecimalQty(o.qtyBase, "qtyBase");
    if ("error" in q) {
      return { error: q.error, status: 400 };
    }
    if (!q.greaterThan(0)) {
      return { error: "qtyBase must be > 0", status: 400 };
    }

    if (inventoryItemId && componentMenuItemId) {
      return {
        error: "ingredient cannot be both inventory and menu item",
        status: 400,
      };
    }

    if (inventoryItemId) {
      if (seenInventory.has(inventoryItemId)) {
        return {
          error: "duplicate inventory ingredient",
          status: 400,
        };
      }
      seenInventory.add(inventoryItemId);
      ingredients.push({
        kind: "inventory",
        inventoryItemId,
        qtyBase: q,
      });
      continue;
    }

    if (componentMenuItemId) {
      const key = `${componentMenuItemId}\0${componentVariationId ?? ""}`;
      if (seenComponents.has(key)) {
        return {
          error: "duplicate menu item component",
          status: 400,
        };
      }
      seenComponents.add(key);
      ingredients.push({
        kind: "menu_item",
        componentMenuItemId,
        componentVariationId,
        qtyBase: q,
      });
      continue;
    }

    return {
      error: "ingredient requires inventoryItemId or componentMenuItemId",
      status: 400,
    };
  }

  if (ingredients.length === 0) {
    return { error: "ingredients[] required", status: 400 };
  }
  return ingredients;
}

export function toRecipeIngredientCreates(
  ingredients: ParsedRecipeIngredient[],
): {
  inventoryItemId?: string;
  componentMenuItemId?: string;
  componentVariationId?: string | null;
  qtyBase: Prisma.Decimal;
}[] {
  return ingredients.map((i) =>
    i.kind === "inventory"
      ? {
          inventoryItemId: i.inventoryItemId,
          qtyBase: i.qtyBase,
        }
      : {
          componentMenuItemId: i.componentMenuItemId,
          componentVariationId: i.componentVariationId,
          qtyBase: i.qtyBase,
        },
  );
}

/** Detect A → … → A cycles among menu-item component edges (depth-limited DFS). */
export async function assertNoRecipeComponentCycles(
  tx: Prisma.TransactionClient,
  rootMenuItemId: string,
  edges: { componentMenuItemId: string }[],
): Promise<{ error: string } | null> {
  for (const edge of edges) {
    if (edge.componentMenuItemId === rootMenuItemId) {
      return { error: "Recipe cannot include itself as a component" };
    }
  }

  async function reaches(
    fromMenuItemId: string,
    target: string,
    depth: number,
    stack: Set<string>,
  ): Promise<boolean> {
    if (fromMenuItemId === target) return true;
    if (depth <= 0 || stack.has(fromMenuItemId)) return false;
    stack.add(fromMenuItemId);

    const versions = await tx.recipeVersion.findMany({
      where: { menuItemId: fromMenuItemId },
      select: {
        ingredients: {
          where: { componentMenuItemId: { not: null } },
          select: { componentMenuItemId: true },
        },
      },
      take: 40,
    });

    for (const v of versions) {
      for (const ing of v.ingredients) {
        if (!ing.componentMenuItemId) continue;
        if (
          await reaches(ing.componentMenuItemId, target, depth - 1, stack)
        ) {
          return true;
        }
      }
    }
    stack.delete(fromMenuItemId);
    return false;
  }

  for (const edge of edges) {
    // If component (or anything it uses) already reaches root, adding root → component cycles.
    if (await reaches(edge.componentMenuItemId, rootMenuItemId, 8, new Set())) {
      return {
        error: `Circular recipe: ${edge.componentMenuItemId} already depends on this dish`,
      };
    }
  }
  return null;
}
