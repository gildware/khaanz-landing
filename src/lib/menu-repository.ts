import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { normalizeMenuCombos } from "@/lib/menu-combos";
import { uniqueCategoryIds } from "@/lib/category-slug";
import { normalizeMenuCategories } from "@/lib/menu-payload-normalize";
import type { MenuPayload } from "@/types/menu-payload";
import type { MenuAddon, MenuCombo, MenuItem } from "@/types/menu";
import type { MenuCategoryDef } from "@/types/menu-category";
import { defaultDescriptionForItem } from "@/lib/menu-default-description";

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
          notForSale: true,
          available: true,
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
    notForSale: c.notForSale || undefined,
    available: c.available === false ? false : undefined,
  }));

  const menuItems: MenuItem[] = items.map((row) => {
    const category = rootCategoryName(row.categoryId, catById);
    const storedDescription = (row.description ?? "").trim();
    const description =
      storedDescription ||
      defaultDescriptionForItem({ name: row.name, category });

    return {
      id: row.id,
      name: row.name,
      category,
      description,
      image: row.image,
      isVeg: row.isVeg,
      recommended: row.recommended || undefined,
      available: row.available,
      notForSale: row.notForSale || undefined,
      recommendedSortOrder: row.recommendedSortOrder,
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
    };
  });

  const menuCombos: MenuCombo[] = combos.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: c.image,
    price: c.price,
    isVeg: c.isVeg,
    recommended: c.recommended || undefined,
    available: c.available,
    recommendedSortOrder: c.recommendedSortOrder,
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

type MenuTx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function upsertMenuItemRowInTx(
  tx: MenuTx,
  it: MenuItem,
  categoryId: string,
  sortOrder: number,
): Promise<void> {
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
      notForSale: it.notForSale === true,
      sortOrder,
      recommendedSortOrder: it.recommendedSortOrder ?? 0,
    },
    update: {
      categoryId,
      name: it.name,
      description: it.description ?? "",
      image: it.image ?? "",
      isVeg: it.isVeg,
      recommended: it.recommended ?? false,
      available: it.available !== false,
      notForSale: it.notForSale === true,
      sortOrder,
      ...(typeof it.recommendedSortOrder === "number"
        ? { recommendedSortOrder: it.recommendedSortOrder }
        : {}),
    },
  });

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

  const keepVariationIds = it.variations.map((v) => v.id);
  if (keepVariationIds.length > 0) {
    const orphanVariations = await tx.menuItemVariation.findMany({
      where: { itemId: it.id, id: { notIn: keepVariationIds } },
      select: { id: true },
    });
    if (orphanVariations.length > 0) {
      const orphanIds = orphanVariations.map((v) => v.id);
      const wastageCount = await tx.menuWastageEntry.count({
        where: { variationId: { in: orphanIds } },
      });
      if (wastageCount > 0) {
        throw new Error(
          "Cannot remove a size/variation that has wastage records. Clear or reassign wastage first.",
        );
      }
      await tx.recipeVersion.deleteMany({
        where: { variationId: { in: orphanIds } },
      });
      await tx.menuItemVariation.deleteMany({
        where: { itemId: it.id, id: { in: orphanIds } },
      });
    }
  }

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

  const keepAddonKeys = it.addons.map((a) => a.id);
  await tx.menuItemAddon.deleteMany({
    where: {
      itemId: it.id,
      addonKey: {
        notIn: keepAddonKeys.length > 0 ? keepAddonKeys : ["__none__"],
      },
    },
  });
}

/** Upsert one menu item and sync its variations/add-ons (including removals). */
export async function writeMenuItem(item: MenuItem): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { name: item.category, parentId: null },
      select: { id: true },
    });
    if (!category) {
      throw new Error(`Category not found: ${item.category}`);
    }

    const existing = await tx.menuItem.findUnique({
      where: { id: item.id },
      select: { sortOrder: true, recommendedSortOrder: true },
    });
    const sortOrder =
      existing?.sortOrder ??
      (await tx.menuItem.count({ where: { categoryId: category.id } }));

    await upsertMenuItemRowInTx(
      tx,
      {
        ...item,
        recommendedSortOrder:
          item.recommendedSortOrder ?? existing?.recommendedSortOrder ?? 0,
      },
      category.id,
      sortOrder,
    );
  });
}

async function upsertGlobalAddonsInTx(tx: MenuTx, addons: MenuAddon[]): Promise<void> {
  for (let gi = 0; gi < addons.length; gi++) {
    const g = addons[gi]!;
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

  const keepIds = addons.map((g) => g.id);
  await tx.menuGlobalAddon.deleteMany({
    where: {
      id: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] },
    },
  });
}

/** Upsert global add-ons and remove rows absent from the payload. */
export async function writeGlobalAddons(addons: MenuAddon[]): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await upsertGlobalAddonsInTx(tx, addons);
  });
}

async function upsertCategoriesInTx(
  tx: MenuTx,
  categoriesNorm: MenuCategoryDef[],
  categoryMeta: { id: string; name: string }[],
): Promise<void> {
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
        notForSale: def?.notForSale === true,
        available: def?.available !== false,
      },
      update: {
        name,
        image: (def?.image ?? "").trim(),
        icon: def?.icon?.trim() || "utensils-crossed",
        parentId: null,
        sortOrder: i,
        notForSale: def?.notForSale === true,
        available: def?.available !== false,
      },
    });
  }
}

/** Upsert top-level categories without rewriting menu items. */
export async function writeMenuCategories(categories: MenuCategoryDef[]): Promise<void> {
  const prisma = getPrisma();
  const categoriesNorm = normalizeMenuCategories(categories);
  const categoryMeta = uniqueCategoryIds(categoriesNorm.map((c) => c.name));

  await prisma.$transaction(async (tx) => {
    await upsertCategoriesInTx(tx, categoriesNorm, categoryMeta);
  });
}

/** Mark every item in a category as not-for-sale (or for-sale). */
export async function writeCategoryItemsNotForSale(
  categoryName: string,
  notForSale: boolean,
): Promise<void> {
  const prisma = getPrisma();
  const category = await prisma.category.findFirst({
    where: { name: categoryName, parentId: null },
    select: { id: true },
  });
  if (!category) {
    throw new Error(`Category not found: ${categoryName}`);
  }
  await prisma.menuItem.updateMany({
    where: { categoryId: category.id },
    data: { notForSale },
  });
}

async function upsertMenuComboInTx(
  tx: MenuTx,
  combo: MenuCombo,
  sortOrder: number,
): Promise<void> {
  await tx.menuCombo.upsert({
    where: { id: combo.id },
    create: {
      id: combo.id,
      name: combo.name,
      description: combo.description ?? "",
      image: combo.image ?? "",
      price: combo.price,
      isVeg: combo.isVeg,
      recommended: combo.recommended ?? false,
      available: combo.available !== false,
      sortOrder,
      recommendedSortOrder: combo.recommendedSortOrder ?? 0,
    },
    update: {
      name: combo.name,
      description: combo.description ?? "",
      image: combo.image ?? "",
      price: combo.price,
      isVeg: combo.isVeg,
      recommended: combo.recommended ?? false,
      available: combo.available !== false,
      sortOrder,
      ...(typeof combo.recommendedSortOrder === "number"
        ? { recommendedSortOrder: combo.recommendedSortOrder }
        : {}),
    },
  });

  const existingComponents = await tx.menuComboComponent.findMany({
    where: { comboId: combo.id },
    orderBy: { sortOrder: "asc" },
  });
  for (let si = 0; si < combo.components.length; si++) {
    const comp = combo.components[si]!;
    const existing = existingComponents[si];
    const data = {
      itemId: comp.itemId,
      variationId: comp.variationId,
      quantity: comp.quantity ?? 1,
      sortOrder: si,
    };
    if (existing) {
      await tx.menuComboComponent.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await tx.menuComboComponent.create({
        data: { comboId: combo.id, ...data },
      });
    }
  }
  if (existingComponents.length > combo.components.length) {
    const orphanIds = existingComponents
      .slice(combo.components.length)
      .map((row) => row.id);
    await tx.menuComboComponent.deleteMany({
      where: { id: { in: orphanIds } },
    });
  }
}

/** Upsert one combo and sync its components (including removals). */
export async function writeMenuCombo(combo: MenuCombo): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.menuCombo.findUnique({
      where: { id: combo.id },
      select: { sortOrder: true, recommendedSortOrder: true },
    });
    const sortOrder = existing?.sortOrder ?? (await tx.menuCombo.count());
    await upsertMenuComboInTx(
      tx,
      {
        ...combo,
        recommendedSortOrder:
          combo.recommendedSortOrder ?? existing?.recommendedSortOrder ?? 0,
      },
      sortOrder,
    );
  });
}

/** Delete one combo and its components. */
export async function deleteMenuCombo(comboId: string): Promise<void> {
  const prisma = getPrisma();
  const result = await prisma.menuCombo.deleteMany({ where: { id: comboId } });
  if (result.count === 0) throw new Error("Combo not found");
}

/** Delete one menu item when nothing blocks it. */
export async function deleteMenuItem(itemId: string): Promise<void> {
  const prisma = getPrisma();
  try {
    await prisma.menuItem.delete({ where: { id: itemId } });
  } catch {
    throw new Error(
      "Cannot delete this item — it may have orders, wastage, vendor sales, or recipes linked to it.",
    );
  }
}

/**
 * Full catalog sync for admin menu saves and bundled-default seeding.
 *
 * Upserts categories, items, variations, addons, combos, and global add-ons by
 * stable id. Top-level rows (categories, items) absent from the payload are
 * left untouched so admin-added dishes and FK-linked data survive sync. For each
 * item in the payload, variations and add-ons not listed are removed.
 */
export async function writeMenuPayload(payload: MenuPayload): Promise<void> {
  const prisma = getPrisma();
  const combos = normalizeMenuCombos(payload.combos);
  const categoriesNorm = normalizeMenuCategories(payload.categories);
  const categoryMeta = uniqueCategoryIds(categoriesNorm.map((c) => c.name));
  const nameToId = new Map(categoryMeta.map((c) => [c.name, c.id]));

  const fallbackCategoryId = categoryMeta[0]?.id;
  if (!fallbackCategoryId && payload.items.length > 0) {
    throw new Error("Menu must include at least one category when items exist.");
  }

  // Full-catalog sync touches many rows; remote DBs can exceed Prisma's 5s default.
  await prisma.$transaction(
    async (tx) => {
    await upsertCategoriesInTx(tx, categoriesNorm, categoryMeta);

    await upsertGlobalAddonsInTx(tx, payload.globalAddons);

    for (let ii = 0; ii < payload.items.length; ii++) {
      const it = payload.items[ii]!;
      const categoryId =
        nameToId.get(it.category) ?? fallbackCategoryId ?? categoryMeta[0]!.id;

      await upsertMenuItemRowInTx(tx, it, categoryId, ii);
    }

    for (let ci = 0; ci < combos.length; ci++) {
      await upsertMenuComboInTx(tx, combos[ci]!, ci);
    }
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

/**
 * Home-layout save: reorder categories/items, toggle category/item visibility,
 * and set which items/combos are recommended on the storefront home page.
 *
 * Targeted `sortOrder` / `available` / `recommended` / `recommendedSortOrder`
 * updates only — never deletes menu rows. Catalog edits go through
 * `writeMenuPayload`.
 */
export async function writeMenuLayout(layout: {
  categories: { name: string; available?: boolean }[];
  items: {
    id: string;
    available: boolean;
    recommended?: boolean;
    recommendedSortOrder?: number;
  }[];
  combos?: {
    id: string;
    recommended: boolean;
    recommendedSortOrder?: number;
  }[];
}): Promise<void> {
  const prisma = getPrisma();

  await prisma.$transaction(
    async (tx) => {
      const topCategories = await tx.category.findMany({
        where: { parentId: null },
        select: { id: true, name: true },
      });
      const idByName = new Map(topCategories.map((c) => [c.name, c.id]));

      const catRows: { id: string; sortOrder: number; available: boolean }[] =
        [];
      const seen = new Set<string>();
      for (let i = 0; i < layout.categories.length; i++) {
        const cat = layout.categories[i]!;
        const id = idByName.get(cat.name);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        catRows.push({
          id,
          sortOrder: i,
          available: cat.available !== false,
        });
      }

      if (catRows.length > 0) {
        await tx.$executeRaw`
          UPDATE categories AS c
          SET
            sort_order = v.sort_order,
            available = v.available
          FROM (
            VALUES ${Prisma.join(
              catRows.map(
                (r) =>
                  Prisma.sql`(${r.id}, ${r.sortOrder}::int, ${r.available})`,
              ),
            )}
          ) AS v(id, sort_order, available)
          WHERE c.id = v.id
        `;
      }

      if (layout.items.length > 0) {
        await tx.$executeRaw`
          UPDATE menu_items AS m
          SET
            sort_order = v.sort_order,
            available = v.available,
            recommended = v.recommended,
            recommended_sort_order = v.recommended_sort_order
          FROM (
            VALUES ${Prisma.join(
              layout.items.map(
                (it, i) =>
                  Prisma.sql`(${it.id}, ${i}::int, ${it.available}, ${it.recommended === true}, ${typeof it.recommendedSortOrder === "number" ? it.recommendedSortOrder : 0}::int)`,
              ),
            )}
          ) AS v(id, sort_order, available, recommended, recommended_sort_order)
          WHERE m.id = v.id
        `;
      }

      const combos = layout.combos ?? [];
      if (combos.length > 0) {
        await tx.$executeRaw`
          UPDATE menu_combos AS m
          SET
            recommended = v.recommended,
            recommended_sort_order = v.recommended_sort_order
          FROM (
            VALUES ${Prisma.join(
              combos.map(
                (c) =>
                  Prisma.sql`(${c.id}, ${c.recommended}, ${typeof c.recommendedSortOrder === "number" ? c.recommendedSortOrder : 0}::int)`,
              ),
            )}
          ) AS v(id, recommended, recommended_sort_order)
          WHERE m.id = v.id
        `;
      }
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

/** Toggle availability / for-sale on a single menu item without a full catalog sync. */
export async function writeMenuItemFlags(
  itemId: string,
  flags: { available?: boolean; notForSale?: boolean },
): Promise<void> {
  const prisma = getPrisma();
  const data: { available?: boolean; notForSale?: boolean } = {};
  if (typeof flags.available === "boolean") data.available = flags.available;
  if (typeof flags.notForSale === "boolean") data.notForSale = flags.notForSale;
  if (Object.keys(data).length === 0) return;

  const result = await prisma.menuItem.updateMany({
    where: { id: itemId },
    data,
  });
  if (result.count === 0) throw new Error("Item not found");
}

/** Kept for script compatibility; menu lives in the database — use `npm run db:seed`. */
export async function ensureMenuFileFromDefaults(): Promise<void> {
  // no-op
}