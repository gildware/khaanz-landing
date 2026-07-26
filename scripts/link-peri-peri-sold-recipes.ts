/**
 * Link Signature Chicken + Burger sold items to Peri Peri prep batches.
 * Run after add-peri-peri-chicken-preps.ts:
 *   npx tsx scripts/link-peri-peri-sold-recipes.ts
 */
import { getPrisma } from "../src/lib/prisma";

type SoldLink = {
  menuItemId: string;
  variationId: string;
  prepId: string;
  prepVariationId: string;
  prepQtyG: number;
  label: string;
};

const BATCH_G = 1143;
const STRIPS_PER_KG = 25;
const WINGS_PER_KG = 16;
const CRISPY_PIECE_G = 90;
const POPCORN_REGULAR_G = 150;
const POPCORN_LARGE_G = 300;
const BURGER_SLICE_G = 114;

const LINKS: SoldLink[] = [
  {
    menuItemId: "khaanz-strips",
    variationId: "khaanz-strips-4",
    prepId: "peri-peri-strips",
    prepVariationId: "peri-peri-strips",
    prepQtyG: Math.round((4 / STRIPS_PER_KG) * BATCH_G),
    label: "Strips 4 Pcs",
  },
  {
    menuItemId: "khaanz-strips",
    variationId: "khaanz-strips-6",
    prepId: "peri-peri-strips",
    prepVariationId: "peri-peri-strips",
    prepQtyG: Math.round((6 / STRIPS_PER_KG) * BATCH_G),
    label: "Strips 6 Pcs",
  },
  {
    menuItemId: "khaanz-strips",
    variationId: "khaanz-strips-8",
    prepId: "peri-peri-strips",
    prepVariationId: "peri-peri-strips",
    prepQtyG: Math.round((8 / STRIPS_PER_KG) * BATCH_G),
    label: "Strips 8 Pcs",
  },
  {
    menuItemId: "khaanz-wings",
    variationId: "khaanz-wings-4",
    prepId: "peri-peri-wings",
    prepVariationId: "peri-peri-wings",
    prepQtyG: Math.round((4 / WINGS_PER_KG) * BATCH_G),
    label: "Wings 4 Pcs",
  },
  {
    menuItemId: "khaanz-wings",
    variationId: "khaanz-wings-6",
    prepId: "peri-peri-wings",
    prepVariationId: "peri-peri-wings",
    prepQtyG: Math.round((6 / WINGS_PER_KG) * BATCH_G),
    label: "Wings 6 Pcs",
  },
  {
    menuItemId: "khaanz-wings",
    variationId: "khaanz-wings-8",
    prepId: "peri-peri-wings",
    prepVariationId: "peri-peri-wings",
    prepQtyG: Math.round((8 / WINGS_PER_KG) * BATCH_G),
    label: "Wings 8 Pcs",
  },
  {
    menuItemId: "khaanz-crispy-chicken",
    variationId: "khaanz-crispy-chicken-2",
    prepId: "peri-peri-crispy-chicken",
    prepVariationId: "peri-peri-crispy-chicken",
    prepQtyG: 2 * CRISPY_PIECE_G,
    label: "Crispy Chicken 2 Pcs",
  },
  {
    menuItemId: "khaanz-crispy-chicken",
    variationId: "khaanz-crispy-chicken-4",
    prepId: "peri-peri-crispy-chicken",
    prepVariationId: "peri-peri-crispy-chicken",
    prepQtyG: 4 * CRISPY_PIECE_G,
    label: "Crispy Chicken 4 Pcs",
  },
  {
    menuItemId: "khaanz-crispy-chicken",
    variationId: "khaanz-crispy-chicken-8",
    prepId: "peri-peri-crispy-chicken",
    prepVariationId: "peri-peri-crispy-chicken",
    prepQtyG: 8 * CRISPY_PIECE_G,
    label: "Crispy Chicken 8 Pcs",
  },
  {
    menuItemId: "khaanz-popcorn",
    variationId: "khaanz-popcorn-regular",
    prepId: "peri-peri-popcorn",
    prepVariationId: "peri-peri-popcorn",
    prepQtyG: POPCORN_REGULAR_G,
    label: "Popcorn Regular",
  },
  {
    menuItemId: "khaanz-popcorn",
    variationId: "khaanz-popcorn-large",
    prepId: "peri-peri-popcorn",
    prepVariationId: "peri-peri-popcorn",
    prepQtyG: POPCORN_LARGE_G,
    label: "Popcorn Large",
  },
  {
    menuItemId: "khaanz-zinger-burger",
    variationId: "khaanz-zinger-burger-single",
    prepId: "peri-peri-burger-slices",
    prepVariationId: "peri-peri-burger-slices",
    prepQtyG: BURGER_SLICE_G,
    label: "Zinger Burger Single",
  },
  {
    menuItemId: "khaanz-tandoori-burger",
    variationId: "khaanz-tandoori-burger-single",
    prepId: "peri-peri-burger-slices",
    prepVariationId: "peri-peri-burger-slices",
    prepQtyG: BURGER_SLICE_G,
    label: "Tandoori Burger Single",
  },
];

async function main() {
  const prisma = getPrisma();

  const prepIds = [...new Set(LINKS.map((l) => l.prepId))];
  for (const prepId of prepIds) {
    const prep = await prisma.menuItem.findUnique({ where: { id: prepId } });
    if (!prep) {
      console.error(`Prep item missing: ${prepId} — run add-peri-peri-chicken-preps.ts first.`);
      process.exit(1);
    }
  }

  for (const link of LINKS) {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: link.menuItemId },
    });
    if (!menuItem) {
      console.error(`Sold menu item not found: ${link.menuItemId}`);
      process.exit(1);
    }

    const variation = await prisma.menuItemVariation.findUnique({
      where: { id: link.variationId },
    });
    if (!variation) {
      console.error(`Variation not found: ${link.variationId}`);
      process.exit(1);
    }

    const existing = await prisma.recipeVersion.findFirst({
      where: {
        menuItemId: link.menuItemId,
        variationId: link.variationId,
      },
    });
    if (existing) {
      console.log(`Skip ${link.variationId} — recipe already exists (${existing.id})`);
      continue;
    }

    const recipe = await prisma.recipeVersion.create({
      data: {
        menuItemId: link.menuItemId,
        variationId: link.variationId,
        effectiveFrom: new Date(),
        label: link.label,
        yieldQty: 1,
        yieldUnit: "",
        ingredients: {
          create: {
            componentMenuItemId: link.prepId,
            componentVariationId: link.prepVariationId,
            qtyBase: link.prepQtyG,
          },
        },
      },
    });

    console.log(
      `Linked ${link.variationId}: ${link.prepQtyG} g × ${link.prepId} (${recipe.id})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
