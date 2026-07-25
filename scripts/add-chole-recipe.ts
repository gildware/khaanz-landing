/**
 * Link base "Chole" menu item to Chole Masala prep (nested recipe).
 * Run: npx tsx scripts/add-chole-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const CHOLE_ID = "chole";
const CHOLE_VARIATION_ID = "chole";
const MASALA_ID = "chole-masala";
const MASALA_VARIATION_ID = "chole-masala";
/** One chole batch = full masala batch (634 g). */
const MASALA_BATCH_G = 634;

async function main() {
  const prisma = getPrisma();

  const chole = await prisma.menuItem.findUnique({ where: { id: CHOLE_ID } });
  if (!chole) {
    console.error('Menu item "chole" not found.');
    process.exit(1);
  }

  const masala = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MASALA_ID, variationId: MASALA_VARIATION_ID },
  });
  if (!masala) {
    console.error('Chole Masala prep recipe missing — run add-chole-masala-recipe.ts first.');
    process.exit(1);
  }

  const existing = await prisma.recipeVersion.findFirst({
    where: { menuItemId: CHOLE_ID, variationId: CHOLE_VARIATION_ID },
  });
  if (existing) {
    console.error("Chole recipe already exists:", existing.id);
    process.exit(1);
  }

  const recipe = await prisma.recipeVersion.create({
    data: {
      menuItemId: CHOLE_ID,
      variationId: CHOLE_VARIATION_ID,
      effectiveFrom: new Date(),
      label: "Chole — masala batch",
      yieldQty: MASALA_BATCH_G,
      yieldUnit: "g",
      ingredients: {
        create: {
          componentMenuItemId: MASALA_ID,
          componentVariationId: MASALA_VARIATION_ID,
          qtyBase: MASALA_BATCH_G,
        },
      },
    },
    include: {
      ingredients: { include: { componentMenuItem: { select: { name: true } } } },
    },
  });

  await prisma.menuItem.update({
    where: { id: CHOLE_ID },
    data: {
      notForSale: true,
      description: "Base chole prep — internal component (634 g masala batch).",
    },
  });

  console.log("Created recipe for chole:", recipe.id, recipe.label);
  console.log(`  ${MASALA_BATCH_G} g × ${recipe.ingredients[0]?.componentMenuItem?.name}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
