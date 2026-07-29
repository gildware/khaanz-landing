import type { Prisma } from "@prisma/client";

export type RecipeVersionWithIngredients = Prisma.RecipeVersionGetPayload<{
  include: { ingredients: true };
}>;

export type MenuComboWithComponents = Prisma.MenuComboGetPayload<{
  include: { components: true };
}>;

/**
 * Per-request snapshot of the menu data needed to expand orders into inventory
 * consumption.
 *
 * Resolving a recipe on demand costs 1-2 queries per menu item per point in
 * time, and nested recipes multiply that. Replaying a month of order lines that
 * way runs into the thousands of round trips. Recipes and combos are small
 * catalog tables, so this loads each of them once up front and answers every
 * later lookup - any menu item, any effective date - from memory.
 *
 * Only safe for a single logical read: it never sees writes made after it was
 * first used, so don't share one across a write that it should observe.
 */
/** Cook item id → source item it is produced from, and the usable yield. */
export type YieldLinkMap = Map<
  string,
  { sourceId: string; yieldPercent: number }
>;

export type MenuConsumptionCache = {
  versionsFor(
    tx: Prisma.TransactionClient,
    menuItemId: string,
  ): Promise<RecipeVersionWithIngredients[]>;
  comboFor(
    tx: Prisma.TransactionClient,
    comboId: string,
  ): Promise<MenuComboWithComponents | null>;
  yieldLinks(tx: Prisma.TransactionClient): Promise<YieldLinkMap>;
};

export function createMenuConsumptionCache(): MenuConsumptionCache {
  let versions: Promise<Map<string, RecipeVersionWithIngredients[]>> | null = null;
  let combos: Promise<Map<string, MenuComboWithComponents>> | null = null;
  let yieldLinks: Promise<YieldLinkMap> | null = null;

  const loadVersions = (tx: Prisma.TransactionClient) => {
    versions ??= tx.recipeVersion
      .findMany({
        orderBy: { effectiveFrom: "desc" },
        include: { ingredients: true },
      })
      .then((rows) => {
        const byMenuItem = new Map<string, RecipeVersionWithIngredients[]>();
        for (const row of rows) {
          const existing = byMenuItem.get(row.menuItemId);
          if (existing) existing.push(row);
          else byMenuItem.set(row.menuItemId, [row]);
        }
        return byMenuItem;
      });
    return versions;
  };

  const loadCombos = (tx: Prisma.TransactionClient) => {
    combos ??= tx.menuCombo
      .findMany({ include: { components: true } })
      .then((rows) => new Map(rows.map((c) => [c.id, c] as const)));
    return combos;
  };

  const loadYieldLinks = (tx: Prisma.TransactionClient) => {
    yieldLinks ??= loadYieldLinkMap(tx);
    return yieldLinks;
  };

  return {
    async versionsFor(tx, menuItemId) {
      return (await loadVersions(tx)).get(menuItemId) ?? [];
    },

    async comboFor(tx, comboId) {
      return (await loadCombos(tx)).get(comboId) ?? null;
    },

    async yieldLinks(tx) {
      return loadYieldLinks(tx);
    },
  };
}

/**
 * Every inventory item produced from another item (e.g. boneless chicken from
 * frozen chicken). Only a handful of items are linked, so this is one small
 * query that callers should load once per request rather than per recipe.
 */
export async function loadYieldLinkMap(
  tx: Prisma.TransactionClient,
): Promise<YieldLinkMap> {
  const rows = await tx.inventoryItem.findMany({
    where: { yieldSourceItemId: { not: null }, yieldPercent: { not: null } },
    select: { id: true, yieldSourceItemId: true, yieldPercent: true },
  });

  const map: YieldLinkMap = new Map();
  for (const row of rows) {
    const sourceId = row.yieldSourceItemId;
    if (!sourceId || sourceId === row.id) continue;
    const pct = Number(row.yieldPercent?.toString() ?? "");
    if (!(pct > 0) || pct > 100) continue;
    map.set(row.id, { sourceId, yieldPercent: pct });
  }
  return map;
}
