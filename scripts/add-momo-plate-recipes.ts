/**
 * Link sold Momo Mania plates to base Momo filling (nested recipe).
 * Run: npx tsx scripts/add-momo-plate-recipes.ts
 */
import { PrismaClient } from "@prisma/client";

/** Momos served per "Plate" variation — adjust if your standard differs. */
const MOMOS_PER_PLATE = 6;

const PLATE_ITEMS = [
  {
    menuItemId: "fried-chicken-momo",
    variationId: "fried-chicken-momo",
    label: "Fried chicken momo plate",
  },
  {
    menuItemId: "steamed-chicken-momo",
    variationId: "steamed-chicken-momo",
    label: "Steamed chicken momo plate",
  },
  {
    menuItemId: "tandoori-chicken-momo",
    variationId: "tandoori-chicken-momo",
    label: "Tandoori chicken momo plate",
  },
] as const;

const BASE_MOMO_ID = "momo";
const BASE_MOMO_VARIATION_ID = "momo";

async function main() {
  const prisma = new PrismaClient();

  const base = await prisma.menuItem.findUnique({
    where: { id: BASE_MOMO_ID },
    include: { recipeVersions: { take: 1 } },
  });
  if (!base?.recipeVersions[0]) {
    console.error('Base "Momo" item or its recipe is missing — run add-momo-recipe.ts first.');
    process.exit(1);
  }

  for (const plate of PLATE_ITEMS) {
    const existing = await prisma.recipeVersion.findFirst({
      where: {
        menuItemId: plate.menuItemId,
        variationId: plate.variationId,
      },
    });
    if (existing) {
      console.log(`Skip ${plate.menuItemId} — recipe already exists (${existing.id})`);
      continue;
    }

    const menu = await prisma.menuItem.findUnique({
      where: { id: plate.menuItemId },
    });
    if (!menu) {
      console.error(`Menu item not found: ${plate.menuItemId}`);
      process.exit(1);
    }

    const recipe = await prisma.recipeVersion.create({
      data: {
        menuItemId: plate.menuItemId,
        variationId: plate.variationId,
        effectiveFrom: new Date(),
        label: plate.label,
        yieldQty: 1,
        yieldUnit: "",
        ingredients: {
          create: {
            componentMenuItemId: BASE_MOMO_ID,
            componentVariationId: BASE_MOMO_VARIATION_ID,
            qtyBase: MOMOS_PER_PLATE,
          },
        },
      },
    });

    console.log(
      `Created recipe for ${plate.menuItemId}: ${MOMOS_PER_PLATE} × Momo per plate (${recipe.id})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
