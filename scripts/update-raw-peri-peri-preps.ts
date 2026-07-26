/**
 * Normalize Raw Peri Peri preps: "Raw …" names + 1 kg chicken / 143 g marinade / 1143 g yield.
 * Run: npx tsx scripts/update-raw-peri-peri-preps.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MARINADE_ID = "peri-peri-marinade";
const MARINADE_VARIATION_ID = "peri-peri-marinade";

const CHICKEN_BONELESS = "cmrnjc020006xpm0ijsppiu4v";
const CHICKEN_WITH_BONE = "cmro8p2fs001nnt0idybm76en";

const CHICKEN_G = 1000;
const MARINADE_G = 143;
const YIELD_G = 1143;

const PREPS = [
  {
    id: "peri-peri-strips",
    name: "Raw Peri Peri Strips",
    description: "Marinated peri peri strips — 1 kg batch (25 × 40 g).",
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-popcorn",
    name: "Raw Peri Peri Popcorn",
    description: "Marinated peri peri popcorn chicken — 1 kg batch.",
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-crispy-chicken",
    name: "Raw Peri Peri Crispy Chicken",
    description: "Marinated peri peri crispy big pieces — 1 kg batch (~11 × 90 g).",
    chickenInventoryId: CHICKEN_BONELESS,
  },
  {
    id: "peri-peri-wings",
    name: "Raw Peri Peri Wings",
    description: "Marinated peri peri wings — 1 kg batch (~16 pc).",
    chickenInventoryId: CHICKEN_WITH_BONE,
  },
  {
    id: "peri-peri-burger-slices",
    name: "Raw Peri Peri Burger Slices",
    description: "Marinated peri peri burger chicken slices — 1 kg batch (~10 pc).",
    chickenInventoryId: CHICKEN_BONELESS,
  },
] as const;

async function main() {
  const prisma = getPrisma();

  for (const prep of PREPS) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: prep.id } });
    if (!menuItem) {
      console.error(`Missing menu item: ${prep.id}`);
      process.exit(1);
    }

    const recipe = await prisma.recipeVersion.findFirst({
      where: { menuItemId: prep.id, variationId: prep.id },
      include: { ingredients: true },
    });
    if (!recipe) {
      console.error(`Missing recipe for: ${prep.id}`);
      process.exit(1);
    }

    await prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id: prep.id },
        data: { name: prep.name, description: prep.description },
      });

      await tx.recipeIngredient.deleteMany({ where: { recipeVersionId: recipe.id } });

      await tx.recipeVersion.update({
        where: { id: recipe.id },
        data: {
          label: `${prep.name} — 1 kg batch`,
          yieldQty: YIELD_G,
          yieldUnit: "g",
        },
      });

      await tx.recipeIngredient.createMany({
        data: [
          {
            recipeVersionId: recipe.id,
            inventoryItemId: prep.chickenInventoryId,
            qtyBase: CHICKEN_G,
          },
          {
            recipeVersionId: recipe.id,
            componentMenuItemId: MARINADE_ID,
            componentVariationId: MARINADE_VARIATION_ID,
            qtyBase: MARINADE_G,
          },
        ],
      });
    });

    console.log(`Updated ${prep.id}: ${prep.name} — ${CHICKEN_G} g chicken + ${MARINADE_G} g marinade → ${YIELD_G} g`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
