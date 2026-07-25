/**
 * Add cooking Water inventory item + top up dough recipes to match batch yields.
 * Run: npx tsx scripts/add-dough-water.ts
 */
import { getPrisma } from "../src/lib/prisma";

const WATER_NAME = "Water";

const DOUGH_WATER: { menuItemId: string; waterG: number }[] = [
  { menuItemId: "pizza-dough", waterG: 1555 }, // 5000 − 3445
  { menuItemId: "naan-dough", waterG: 1974 }, // 4500 − 2526
  // roll-dough: 1500 g maida = 1500 g yield; egg tracked separately in pc
];

async function main() {
  const prisma = getPrisma();

  let water = await prisma.inventoryItem.findFirst({
    where: { name: WATER_NAME, active: true },
    select: { id: true, name: true },
  });

  if (!water) {
    water = await prisma.inventoryItem.create({
      data: {
        name: WATER_NAME,
        category: "Miscellaneous",
        baseUnit: "ml",
        purchaseUnit: "l",
        baseUnitsPerPurchaseUnit: 1000,
        stockOnHandBase: 0,
        minStockBase: 0,
        avgCostPaisePerBase: 0,
        lastPurchasePaisePerBase: 0,
        active: true,
      },
      select: { id: true, name: true },
    });
    console.log("Created inventory item:", water.name, water.id);
  } else {
    console.log("Using inventory item:", water.name, water.id);
  }

  for (const { menuItemId, waterG } of DOUGH_WATER) {
    const recipe = await prisma.recipeVersion.findFirst({
      where: { menuItemId, variationId: menuItemId },
      orderBy: { effectiveFrom: "desc" },
      include: {
        ingredients: { include: { item: { select: { name: true } } } },
      },
    });

    if (!recipe) {
      console.error(`Recipe not found for ${menuItemId}`);
      process.exit(1);
    }

    const hasWater = recipe.ingredients.some((i) => i.item?.name === WATER_NAME);
    if (hasWater) {
      console.log(`Skip ${menuItemId} — water already in recipe`);
      continue;
    }

    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: recipe.id,
        inventoryItemId: water.id,
        qtyBase: waterG,
      },
    });

    console.log(`Added ${waterG} ml Water to ${menuItemId} (${recipe.label})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
