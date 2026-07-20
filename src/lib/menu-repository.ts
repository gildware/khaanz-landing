import { getPrisma } from "@/lib/prisma";
import { normalizeMenuCombos } from "@/lib/menu-combos";
import { uniqueCategoryIds } from "@/lib/category-slug";
import { normalizeMenuCategories } from "@/lib/menu-payload-normalize";
import type { MenuPayload } from "@/types/menu-payload";
import type { MenuCombo, MenuItem } from "@/types/menu";

function rootCategoryName(
  categoryId: string,
  byId: Map<string, { id: string; name: string; parentId: string | null }>,
): string {
  let cur = byId.get(categoryId);
  if (!cur) return "";
  while (cur.parentId) {
    const p = byId.get(cur.parentId);
    if (!p) break;
    cur = p;
  }
  return cur.name;
}

export async function readMenuPayload(): Promise<MenuPayload> {
  const prisma = getPrisma();

  const [topCategories, allCategories, globalAddons, items, combos] =
    await Promise.all([
      prisma.category.findMany({
        where: { parentId: null },
        select: {
          id: true,
          name: true,
          parentId: true,
          sortOrder: true,
          image: true,
          icon: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.category.findMany({
        select: { id: true, name: true, parentId: true, sortOrder: true },
      }),
      prisma.menuGlobalAddon.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.menuItem.findMany({
        include: {
          variations: { orderBy: { sortOrder: "asc" } },
          addons: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.menuCombo.findMany({
        include: {
          components: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

  if (
    topCategories.length === 0 &&
    items.length === 0 &&
    globalAddons.length === 0 &&
    combos.length === 0
  ) {
    return { categories: [], globalAddons: [], items: [], combos: [] };
  }

  const catById = new Map(
    allCategories.map((c) => [c.id, { id: c.id, name: c.name, parentId: c.parentId }]),
  );

  const categories = topCategories.map((c) => ({
    name: c.name,
    image: (c.image ?? "").trim(),
    icon: (c.icon ?? "").trim() || "utensils-crossed",
  }));

  const menuItems: MenuItem[] = items.map((row) => ({
    id: row.id,
    name: row.name,
    category: rootCategoryName(row.categoryId, catById),
    description: row.description,
    image: row.image,
    isVeg: row.isVeg,
    recommended: row.recommended || undefined,
    available: row.available,
    variations: row.variations.map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price,
    })),
    addons: row.addons.map((a) => ({
      id: a.addonKey,
      name: a.name,
      price: a.price,
    })),
  }));

  const menuCombos: MenuCombo[] = combos.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: c.image,
    price: c.price,
    isVeg: c.isVeg,
    recommended: c.recommended || undefined,
    available: c.available,
    components: c.components.map((x) => ({
      itemId: x.itemId,
      variationId: x.variationId,
      quantity: x.quantity,
    })),
  }));

  return {
    categories,
    globalAddons: globalAddons.map((g) => ({
      id: g.id,
      name: g.name,
      price: g.price,
    })),
    items: menuItems,
    combos: normalizeMenuCombos(menuCombos),
  };
}

/**
 * Full catalog sync for admin menu saves.
 *
 * Upserts categories/items/combos by stable id so existing `menu_items` rows are
 * kept. That preserves FK-cascaded data such as recipes. Rows absent from the
 * payload are deleted (removing a dish still cascades that dish's recipes).
 */
export async function writeMenuPayload(payload: MenuPayload): Promise<void> {
  const prisma = getPrisma();
  const combos = normalizeMenuCombos(payload.combos);
  const categoriesNorm = normalizeMenuCategories(payload.categories);
  const categoryMeta = uniqueCategoryIds(categoriesNorm.map((c) => c.name));
  const nameToId = new Map(categoryMeta.map((c) => [c.name, c.id]));
  const keepCategoryIds = categoryMeta.map((c) => c.id);
  const keepItemIds = payload.items.map((it) => it.id);
  const keepComboIds = combos.map((c) => c.id);
  const keepGlobalAddonIds = payload.globalAddons.map((g) => g.id);

  const fallbackCategoryId = categoryMeta[0]?.id;
  if (!fallbackCategoryId && payload.items.length > 0) {
    throw new Error("Menu must include at least one category when items exist.");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < categoryMeta.length; i++) {
      const { id, name } = categoryMeta[i]!;
      const def = categoriesNorm[i];
      await tx.category.upsert({
        where: { id },
        create: {
          id,
          name,
          image: (def?.image ?? "").trim(),
          icon: def?.icon?.trim() || "utensils-crossed",
          parentId: null,
          sortOrder: i,
        },
        update: {
          name,
          image: (def?.image ?? "").trim(),
          icon: def?.icon?.trim() || "utensils-crossed",
          parentId: null,
          sortOrder: i,
        },
      });
    }

    for (let gi = 0; gi < payload.globalAddons.length; gi++) {
      const g = payload.globalAddons[gi]!;
      await tx.menuGlobalAddon.upsert({
        where: { id: g.id },
        create: {
          id: g.id,
          name: g.name,
          price: g.price,
          sortOrder: gi,
        },
        update: {
          name: g.name,
          price: g.price,
          sortOrder: gi,
        },
      });
    }

    for (let ii = 0; ii < payload.items.length; ii++) {
      const it = payload.items[ii]!;
      const categoryId =
        nameToId.get(it.category) ?? fallbackCategoryId ?? categoryMeta[0]!.id;

      await tx.menuItem.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          categoryId,
          name: it.name,
          description: it.description ?? "",
          image: it.image ?? "",
          isVeg: it.isVeg,
          recommended: it.recommended ?? false,
          available: it.available !== false,
          sortOrder: ii,
        },
        update: {
          categoryId,
          name: it.name,
          description: it.description ?? "",
          image: it.image ?? "",
          isVeg: it.isVeg,
          recommended: it.recommended ?? false,
          available: it.available !== false,
          sortOrder: ii,
        },
      });

      const keepVariationIds = it.variations.map((v) => v.id);
      for (let vi = 0; vi < it.variations.length; vi++) {
        const v = it.variations[vi]!;
        await tx.menuItemVariation.upsert({
          where: { id: v.id },
          create: {
            id: v.id,
            itemId: it.id,
            name: v.name,
            price: v.price,
            sortOrder: vi,
          },
          update: {
            itemId: it.id,
            name: v.name,
            price: v.price,
            sortOrder: vi,
          },
        });
      }
      if (keepVariationIds.length === 0) {
        await tx.menuItemVariation.deleteMany({ where: { itemId: it.id } });
      } else {
        await tx.menuItemVariation.deleteMany({
          where: { itemId: it.id, id: { notIn: keepVariationIds } },
        });
      }

      const keepAddonKeys = it.addons.map((a) => a.id);
      for (let ai = 0; ai < it.addons.length; ai++) {
        const a = it.addons[ai]!;
        await tx.menuItemAddon.upsert({
          where: { itemId_addonKey: { itemId: it.id, addonKey: a.id } },
          create: {
            itemId: it.id,
            addonKey: a.id,
            name: a.name,
            price: a.price,
            sortOrder: ai,
          },
          update: {
            name: a.name,
            price: a.price,
            sortOrder: ai,
          },
        });
      }
      if (keepAddonKeys.length === 0) {
        await tx.menuItemAddon.deleteMany({ where: { itemId: it.id } });
      } else {
        await tx.menuItemAddon.deleteMany({
          where: { itemId: it.id, addonKey: { notIn: keepAddonKeys } },
        });
      }
    }

    for (let ci = 0; ci < combos.length; ci++) {
      const c = combos[ci]!;
      await tx.menuCombo.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          name: c.name,
          description: c.description ?? "",
          image: c.image ?? "",
          price: c.price,
          isVeg: c.isVeg,
          recommended: c.recommended ?? false,
          available: c.available !== false,
          sortOrder: ci,
        },
        update: {
          name: c.name,
          description: c.description ?? "",
          image: c.image ?? "",
          price: c.price,
          isVeg: c.isVeg,
          recommended: c.recommended ?? false,
          available: c.available !== false,
          sortOrder: ci,
        },
      });

      await tx.menuComboComponent.deleteMany({ where: { comboId: c.id } });
      if (c.components.length > 0) {
        await tx.menuComboComponent.createMany({
          data: c.components.map((comp, si) => ({
            comboId: c.id,
            itemId: comp.itemId,
            variationId: comp.variationId,
            quantity: comp.quantity ?? 1,
            sortOrder: si,
          })),
        });
      }
    }

    if (keepComboIds.length === 0) {
      await tx.menuCombo.deleteMany();
    } else {
      await tx.menuCombo.deleteMany({
        where: { id: { notIn: keepComboIds } },
      });
    }

    if (keepGlobalAddonIds.length === 0) {
      await tx.menuGlobalAddon.deleteMany();
    } else {
      await tx.menuGlobalAddon.deleteMany({
        where: { id: { notIn: keepGlobalAddonIds } },
      });
    }

    const removedItems = await tx.menuItem.findMany({
      where:
        keepItemIds.length === 0 ? {} : { id: { notIn: keepItemIds } },
      select: { id: true },
    });
    const removedItemIds = removedItems.map((r) => r.id);
    if (removedItemIds.length > 0) {
      // Nested recipes may Restrict-delete; drop those component lines first.
      await tx.recipeIngredient.deleteMany({
        where: { componentMenuItemId: { in: removedItemIds } },
      });
      await tx.vendorSellableMenuItem.deleteMany({
        where: { menuItemId: { in: removedItemIds } },
      });
      // Recipes for removed items cascade via RecipeVersion.onDelete.
      await tx.menuItem.deleteMany({
        where: { id: { in: removedItemIds } },
      });
    }

    for (;;) {
      const n = await tx.category.deleteMany({
        where: {
          parentId: { not: null },
          ...(keepCategoryIds.length > 0
            ? { id: { notIn: keepCategoryIds } }
            : {}),
        },
      });
      if (n.count === 0) break;
    }
    if (keepCategoryIds.length === 0) {
      await tx.category.deleteMany();
    } else {
      await tx.category.deleteMany({
        where: { id: { notIn: keepCategoryIds } },
      });
    }
  });
}

/**
 * Home-layout save: reorder categories/items, toggle item visibility, and set
 * which items/combos are recommended on the storefront home page.
 *
 * Targeted `sortOrder` / `available` / `recommended` updates only — never
 * deletes menu rows. Catalog edits go through `writeMenuPayload`, which upserts
 * kept items so recipes and other FKs on those rows are preserved.
 */
export async function writeMenuLayout(layout: {
  categories: string[];
  items: { id: string; available: boolean; recommended?: boolean }[];
  combos?: { id: string; recommended: boolean }[];
}): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const topCategories = await tx.category.findMany({
      where: { parentId: null },
      select: { id: true, name: true },
    });
    const idByName = new Map(topCategories.map((c) => [c.name, c.id]));

    const seen = new Set<string>();
    for (let i = 0; i < layout.categories.length; i++) {
      const name = layout.categories[i]!;
      const id = idByName.get(name);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      await tx.category.update({ where: { id }, data: { sortOrder: i } });
    }

    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i]!;
      // updateMany avoids throwing if an item was removed concurrently.
      await tx.menuItem.updateMany({
        where: { id: it.id },
        data: {
          sortOrder: i,
          available: it.available,
          ...(typeof it.recommended === "boolean"
            ? { recommended: it.recommended }
            : {}),
        },
      });
    }

    for (const c of layout.combos ?? []) {
      await tx.menuCombo.updateMany({
        where: { id: c.id },
        data: { recommended: c.recommended },
      });
    }
  });
}

/** Kept for script compatibility; menu lives in the database — use `npm run db:seed`. */
export async function ensureMenuFileFromDefaults(): Promise<void> {
  // no-op
}