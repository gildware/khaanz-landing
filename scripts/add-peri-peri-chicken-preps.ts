/**
 * Add Peri Peri chicken prep Raw Items (marinated + coated batches).
 * Run after update-peri-peri-marinade-recipe.ts:
 *   npx tsx scripts/add-peri-peri-chicken-preps.ts
 */
import { getPrisma } from "../src/lib/prisma";

const CATEGORY_ID = "raw-items";
const MARINADE_ID = "peri-peri-marinade";
const MARINADE_VARIATION_ID = "peri-peri-marinade";

const CHICKEN_BONELESS = "cmrnjc020006xpm0ijsppiu4v";
const CHICKEN_WITH_BONE = "cmro8p2fs001nnt0idybm76en";

/** 1 kg chicken + 143 g marinade (1072 g batch ÷ 7.5 kg total chicken). */
const CHICKEN_G = 1000;
const MARINADE_G = 143;
const YIELD_G = 1143;

const PREPS = [
  {
    id: "peri-peri-strips",
    name: "Raw Peri Peri Strips",
    description: "Marinated peri peri strips — 1 kg batch (25 × 40 g).",
    image: "/menu/strips.jpg",
    sortOrder: 6,
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-popcorn",
    name: "Raw Peri Peri Popcorn",
    description: "Marinated peri peri popcorn chicken — 1 kg batch.",
    image: "/menu/popcorn-chicken.jpg",
    sortOrder: 7,
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-crispy-chicken",
    name: "Raw Peri Peri Crispy Chicken",
    description: "Marinated peri peri crispy big pieces — 1 kg batch (~11 × 90 g).",
    image: "/menu/crispy-chicken.jpg",
    sortOrder: 8,
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-wings",
    name: "Raw Peri Peri Wings",
    description: "Marinated peri peri wings — 1 kg batch (~16 pc).",
    image: "/menu/wings.jpg",
    sortOrder: 9,
    chickenInventoryId: CHICKEN_WITH_BONE,
  },
  {
    id: "peri-peri-burger-slices",
    name: "Raw Peri Peri Burger Slices",
    description: "Marinated peri peri burger chicken slices — 1 kg batch (~10 pc).",
    image: "/menu/zinger-burger.jpg",
    sortOrder: 10,
    chickenG: 1000,
    marinadeG: 143,
    yieldG: 1143,
    chickenInventoryId: CHICKEN_BONELESS,
  },
] as const;

async function main() {
  const prisma = getPrisma();

  const category = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM categories WHERE id = ${CATEGORY_ID} LIMIT 1
  `;
  if (category.length === 0) {
    console.error(`Category "${CATEGORY_ID}" not found.`);
    process.exit(1);
  }

  const marinadeRecipe = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MARINADE_ID, variationId: MARINADE_VARIATION_ID },
  });
  if (!marinadeRecipe) {
    console.error("Peri Peri Marinade recipe missing — run update-peri-peri-marinade-recipe.ts first.");
    process.exit(1);
  }

  const chickenIds = [...new Set(PREPS.map((p) => p.chickenInventoryId))];
  const chickenItems = await prisma.inventoryItem.findMany({
    where: { id: { in: chickenIds }, active: true },
    select: { id: true, name: true },
  });
  if (chickenItems.length !== chickenIds.length) {
    console.error("Missing chicken inventory items.");
    process.exit(1);
  }

  for (const prep of PREPS) {
    const existing = await prisma.menuItem.findUnique({ where: { id: prep.id } });
    if (existing) {
      console.log(`Skip ${prep.id} — already exists`);
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.create({
        data: {
          id: prep.id,
          categoryId: CATEGORY_ID,
          name: prep.name,
          description: prep.description,
          image: prep.image,
          isVeg: false,
          recommended: false,
          available: false,
          notForSale: true,
          sortOrder: prep.sortOrder,
          variations: {
            create: {
              id: prep.id,
              name: "Batch",
              price: 0,
              sortOrder: 0,
            },
          },
        },
      });

      const recipe = await tx.recipeVersion.create({
        data: {
          menuItemId: menuItem.id,
          variationId: prep.id,
          effectiveFrom: new Date(),
          label: `${prep.name} — 1 kg batch`,
          yieldQty: YIELD_G,
          yieldUnit: "g",
          ingredients: {
            create: [
              {
                inventoryItemId: prep.chickenInventoryId,
                qtyBase: CHICKEN_G,
              },
              {
                componentMenuItemId: MARINADE_ID,
                componentVariationId: MARINADE_VARIATION_ID,
                qtyBase: MARINADE_G,
              },
            ],
          },
        },
        include: {
          ingredients: {
            include: {
              item: { select: { name: true, baseUnit: true } },
              componentMenuItem: { select: { name: true } },
            },
          },
        },
      });

      return { menuItem, recipe };
    });

    console.log(`Created ${result.menuItem.id} — yield ${YIELD_G} g`);
    for (const ing of result.recipe.ingredients) {
      if (ing.componentMenuItem) {
        console.log(`  ${ing.componentMenuItem.name}: ${ing.qtyBase.toString()} g`);
      } else {
        console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
