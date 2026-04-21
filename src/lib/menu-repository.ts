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
        // Be resilient to partially-migrated local DBs (older `categories` tables
        // may not have newer columns like `image` / `icon` yet).
        select: { id: true, name: true, parentId: true, sortOrder: true },
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
    image: "",
    icon: "utensils-crossed",
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

export async function writeMenuPayload(payload: MenuPayload): Promise<void> {
  const prisma = getPrisma();
  const combos = normalizeMenuCombos(payload.combos);
  const categoriesNorm = normalizeMenuCategories(payload.categories);
  const categoryMeta = uniqueCategoryIds(categoriesNorm.map((c) => c.name));
  const nameToId = new Map(categoryMeta.map((c) => [c.name, c.id]));

  await prisma.$transaction(async (tx) => {
    await tx.menuComboComponent.deleteMany();
    await tx.menuCombo.deleteMany();
    await tx.menuItemAddon.deleteMany();
    await tx.menuItemVariation.deleteMany();
    await tx.menuItem.deleteMany();
    await tx.menuGlobalAddon.deleteMany();

    for (;;) {
      const n = await tx.category.deleteMany({
        where: { parentId: { not: null } },
      });
      if (n.count === 0) break;
    }
    await tx.category.deleteMany();

    for (let i = 0; i < categoryMeta.length; i++) {
      const { id, name } = categoryMeta[i]!;
      const def = categoriesNorm[i];
      await tx.category.create({
        data: {
          id,
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
      await tx.menuGlobalAddon.create({
        data: {
          id: g.id,
          name: g.name,
          price: g.price,
          sortOrder: gi,
        },
      });
    }

    const fallbackCategoryId = categoryMeta[0]?.id;
    if (!fallbackCategoryId && payload.items.length > 0) {
      throw new Error("Menu must include at least one category when items exist.");
    }

    for (let ii = 0; ii < payload.items.length; ii++) {
      const it = payload.items[ii]!;
      const categoryId =
        nameToId.get(it.category) ?? fallbackCategoryId ?? categoryMeta[0]!.id;
      await tx.menuItem.create({
        data: {
          id: it.id,
          categoryId,
          name: it.name,
          description: it.description ?? "",
          image: it.image ?? "",
          isVeg: it.isVeg,
          recommended: it.recommended ?? false,
          available: it.available !== false,
          sortOrder: ii,
          variations: {
            create: it.variations.map((v, vi) => ({
              id: v.id,
              name: v.name,
              price: v.price,
              sortOrder: vi,
            })),
          },
          addons: {
            create: it.addons.map((a, ai) => ({
              addonKey: a.id,
              name: a.name,
              price: a.price,
              sortOrder: ai,
            })),
          },
        },
      });
    }

    for (let ci = 0; ci < combos.length; ci++) {
      const c = combos[ci]!;
      await tx.menuCombo.create({
        data: {
          id: c.id,
          name: c.name,
          description: c.description ?? "",
          image: c.image ?? "",
          price: c.price,
          isVeg: c.isVeg,
          available: c.available !== false,
          sortOrder: ci,
          components: {
            create: c.components.map((comp, si) => ({
              itemId: comp.itemId,
              variationId: comp.variationId,
              quantity: comp.quantity ?? 1,
              sortOrder: si,
            })),
          },
        },
      });
    }
  });
}

/** Kept for script compatibility; menu lives in the database — use `npm run db:seed`. */
export async function ensureMenuFileFromDefaults(): Promise<void> {
  // no-op
}