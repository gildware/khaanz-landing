/**
 * Single production menu upgrade script. Does two things, idempotently and
 * non-destructively, in one transaction:
 *
 *   1. Additively seeds the KHAANZ menu (categories, items, variations, the
 *      "Make it a Meal" add-on and combos) into an EXISTING database — without
 *      touching the rest of the menu.
 *   2. Syncs the `image` paths of ALL bundled-default rows (categories, items
 *      and combos in `src/data/menu.ts`) onto the matching DB rows, so newly
 *      shipped image assets in `public/menu/` are reflected in the database.
 *
 * Unlike `prisma/seed.ts` (which only seeds when the menu is empty and uses
 * `writeMenuPayload` to fully replace everything), this script can be run
 * repeatedly and only upserts/updates the relevant rows. Safe for local AND
 * production.
 *
 * Usage (reads DATABASE_URL from the environment / .env):
 *   npm run menu:upgrade
 *   # or against a specific DB:
 *   DATABASE_URL="postgres://…" npm run menu:upgrade
 */
import {
  KHAANZ_CATEGORIES,
  KHAANZ_COMBOS,
  KHAANZ_GLOBAL_ADDONS,
  KHAANZ_ITEMS,
} from "../src/data/khaanz-menu";
import { getDefaultMenuPayload } from "../src/data/menu";
import { slugifyCategoryName } from "../src/lib/category-slug";
import { getPrisma } from "../src/lib/prisma";

// KHAANZ rows are appended after existing menu content. A high, fixed base keeps
// ordering deterministic across re-runs and places KHAANZ entries last.
const SORT_BASE = 10_000;

async function main() {
  const prisma = getPrisma();

  let syncedCategories = 0;
  let syncedItems = 0;
  let syncedCombos = 0;

  await prisma.$transaction(async (tx) => {
    // --- Categories (top-level) ---------------------------------------------
    const categoryIdByName = new Map<string, string>();
    for (let i = 0; i < KHAANZ_CATEGORIES.length; i++) {
      const cat = KHAANZ_CATEGORIES[i]!;
      const id = slugifyCategoryName(cat.name);
      categoryIdByName.set(cat.name, id);
      await tx.category.upsert({
        where: { id },
        create: {
          id,
          name: cat.name,
          image: cat.image ?? "",
          icon: cat.icon || "utensils-crossed",
          parentId: null,
          sortOrder: SORT_BASE + i,
        },
        update: {
          name: cat.name,
          image: cat.image ?? "",
          icon: cat.icon || "utensils-crossed",
        },
      });
    }

    // --- Global add-on (e.g. "Make it a Meal") ------------------------------
    for (let i = 0; i < KHAANZ_GLOBAL_ADDONS.length; i++) {
      const g = KHAANZ_GLOBAL_ADDONS[i]!;
      await tx.menuGlobalAddon.upsert({
        where: { id: g.id },
        create: { id: g.id, name: g.name, price: g.price, sortOrder: SORT_BASE + i },
        update: { name: g.name, price: g.price },
      });
    }

    // --- Items + variations + addons ----------------------------------------
    for (let i = 0; i < KHAANZ_ITEMS.length; i++) {
      const it = KHAANZ_ITEMS[i]!;
      const categoryId = categoryIdByName.get(it.category) ?? slugifyCategoryName(it.category);

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
          sortOrder: SORT_BASE + i,
        },
        update: {
          categoryId,
          name: it.name,
          description: it.description ?? "",
          image: it.image ?? "",
          isVeg: it.isVeg,
          recommended: it.recommended ?? false,
          available: it.available !== false,
        },
      });

      // Variations: upsert by stable id (never delete, to preserve any FK refs).
      for (let vi = 0; vi < it.variations.length; vi++) {
        const v = it.variations[vi]!;
        await tx.menuItemVariation.upsert({
          where: { id: v.id },
          create: { id: v.id, itemId: it.id, name: v.name, price: v.price, sortOrder: vi },
          update: { itemId: it.id, name: v.name, price: v.price, sortOrder: vi },
        });
      }

      // Addons: upsert by (itemId, addonKey).
      for (let ai = 0; ai < it.addons.length; ai++) {
        const a = it.addons[ai]!;
        await tx.menuItemAddon.upsert({
          where: { itemId_addonKey: { itemId: it.id, addonKey: a.id } },
          create: { itemId: it.id, addonKey: a.id, name: a.name, price: a.price, sortOrder: ai },
          update: { name: a.name, price: a.price, sortOrder: ai },
        });
      }
    }

    // --- Combos + components -------------------------------------------------
    for (let i = 0; i < KHAANZ_COMBOS.length; i++) {
      const c = KHAANZ_COMBOS[i]!;
      await tx.menuCombo.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          name: c.name,
          description: c.description ?? "",
          image: c.image ?? "",
          price: c.price,
          isVeg: c.isVeg,
          available: c.available !== false,
          sortOrder: SORT_BASE + i,
        },
        update: {
          name: c.name,
          description: c.description ?? "",
          image: c.image ?? "",
          price: c.price,
          isVeg: c.isVeg,
          available: c.available !== false,
        },
      });

      // Components have no natural key — replace them wholesale (safe: no FKs in).
      await tx.menuComboComponent.deleteMany({ where: { comboId: c.id } });
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

    // --- Image sync (all bundled-default rows, non-destructive) -------------
    // Mirror image paths from the bundled defaults onto matching DB rows so
    // newly shipped assets in `public/menu/` show up. Missing rows are skipped.
    const payload = getDefaultMenuPayload();
    for (const cat of payload.categories) {
      const image = (cat.image ?? "").trim();
      if (!image) continue;
      const res = await tx.category.updateMany({ where: { name: cat.name }, data: { image } });
      syncedCategories += res.count;
    }
    for (const it of payload.items) {
      const image = (it.image ?? "").trim();
      if (!image) continue;
      const res = await tx.menuItem.updateMany({ where: { id: it.id }, data: { image } });
      syncedItems += res.count;
    }
    for (const cmb of payload.combos) {
      const image = (cmb.image ?? "").trim();
      if (!image) continue;
      const res = await tx.menuCombo.updateMany({ where: { id: cmb.id }, data: { image } });
      syncedCombos += res.count;
    }
  });

  const [items, combos] = [KHAANZ_ITEMS.length, KHAANZ_COMBOS.length];
  console.log(
    `KHAANZ menu seeded: ${KHAANZ_CATEGORIES.length} categories, ${items} items, ` +
      `${KHAANZ_GLOBAL_ADDONS.length} global add-on(s), ${combos} combos (idempotent).`,
  );
  console.log(
    `Images synced: ${syncedCategories} category row(s), ${syncedItems} item(s), ` +
      `${syncedCombos} combo(s) updated.`,
  );
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    try {
      await getPrisma().$disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
