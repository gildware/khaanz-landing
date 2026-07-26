/**
 * Add "Raita" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-raita-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "raita";
const VARIATION_ID = "raita";
const CATEGORY_ID = "raw-items";
/** Sum of batch quantities (g + ml). */
const YIELD_BATCH = 1305;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrthq7wu0eqwpc0ix1qi4tz6", qtyBase: 1000, note: "Curd" },
  { inventoryItemId: "cms0o1oim0000vu7mvyfws9k0", qtyBase: 200, note: "Water" },
  { inventoryItemId: "cmrnf767r006vpm0ii5w1e90r", qtyBase: 100, note: "Carrot" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 5, note: "Salt" },
];

async function main() {
  const prisma = getPrisma();

  const category = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM categories WHERE id = ${CATEGORY_ID} LIMIT 1
  `;
  if (category.length === 0) {
    console.error(`Category "${CATEGORY_ID}" (Raw Items) not found.`);
    process.exit(1);
  }

  const existing = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (existing) {
    console.error(`Menu item "${MENU_ITEM_ID}" already exists — aborting.`);
    process.exit(1);
  }

  const invIds = RECIPE_LINES.map((l) => l.inventoryItemId);
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: invIds }, active: true },
    select: { id: true, name: true },
  });
  if (found.length !== invIds.length) {
    console.error(
      "Missing inventory items:",
      invIds.filter((id) => !found.some((f) => f.id === id)),
    );
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    const menuItem = await tx.menuItem.create({
      data: {
        id: MENU_ITEM_ID,
        categoryId: CATEGORY_ID,
        name: "Raita",
        description: "Raita prep — internal batch (1 kg curd base).",
        image: "/menu/raw-items.jpg",
        isVeg: true,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 101,
        variations: {
          create: {
            id: VARIATION_ID,
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
        variationId: VARIATION_ID,
        effectiveFrom: new Date(),
        label: "Raita — batch",
        yieldQty: YIELD_BATCH,
        yieldUnit: "g",
        ingredients: {
          create: RECIPE_LINES.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            qtyBase: line.qtyBase,
          })),
        },
      },
      include: {
        ingredients: { include: { item: { select: { name: true, baseUnit: true } } } },
      },
    });

    return { menuItem, recipe };
  });

  console.log("Created menu item:", result.menuItem.id, result.menuItem.name);
  console.log("Created recipe:", result.recipe.id, result.recipe.label);
  console.log(`Yield: ${YIELD_BATCH} g`);
  console.log("Ingredients (full batch):");
  for (const ing of result.recipe.ingredients) {
    console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
