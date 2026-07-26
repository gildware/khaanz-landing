/**
 * Add "Raw Chicken Parath Mix" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-raw-chicken-parath-mix-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "raw-chicken-parath-mix";
const VARIATION_ID = "raw-chicken-parath-mix";
const CATEGORY_ID = "raw-items";
/** Sum of all ingredient weights (g). */
const YIELD_BATCH_G = 1158;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnjc020006xpm0ijsppiu4v", qtyBase: 1000, note: "Chicken Boneless" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 36, note: "Salt" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 36, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 18, note: "Meat Masala" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 18, note: "Kitchen King" },
  { inventoryItemId: "cmrndch830056pm0iyhz7ihng", qtyBase: 6, note: "Ajwain" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 36, note: "Green Chilli" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", qtyBase: 8, note: "Kasoori Methi" },
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
        name: "Raw Chicken Parath Mix",
        description: "Chicken paratha filling prep — internal batch (1 kg chicken base).",
        image: "/menu/chicken-paratha.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 102,
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
        label: "Raw Chicken Parath Mix — batch",
        yieldQty: YIELD_BATCH_G,
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
  console.log(`Yield: ${YIELD_BATCH_G} g`);
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
