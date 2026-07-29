/**
 * Add "Fried Chicken Masala" internal prep under Raw Items + 4 pkt batch recipe.
 * Source: kitchen notebook "4 Pkt Chicken Boneless".
 * Run: npx tsx scripts/add-fried-chicken-masala-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "fried-chicken-masala";
const VARIATION_ID = "fried-chicken-masala";
const CATEGORY_ID = "raw-items";
/** Sum of gram-based ingredient weights (eggs counted in pc, not g). */
const YIELD_BATCH_G = 7325;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnjc020006xpm0ijsppiu4v", qtyBase: 6800, note: "Chicken Boneless" },
  { inventoryItemId: "cmrnbxiv2003mpm0icrqc4un7", qtyBase: 8, note: "Daniya Powder (Corriandor Powder)" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 20, note: "Kitchen King" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 20, note: "Meat Masala" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 15, note: "Garam Masala" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 25, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 50, note: "Salt" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 5, note: "Ajina Moto" },
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", qtyBase: 80, note: "Ginger Garlic Paste" },
  { inventoryItemId: "cmrre0qac00fcnz0i7yfp4qkz", qtyBase: 2, note: "Egg" },
  { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 100, note: "Maida" },
  { inventoryItemId: "cmrnd28cl004qpm0iptx93rjv", qtyBase: 200, note: "Corn Flour" },
  { inventoryItemId: "cms4ypfq3005tvu81mtly0hmu", qtyBase: 2, note: "Food Colour" },
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
        name: "Fried Chicken Masala",
        description:
          "Fried chicken marinade/coating prep — internal component (4 pkt / 6.8 kg chicken batch).",
        image: "/menu/fried-chicken.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 41,
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
        label: "Fried Chicken Masala — 4 pkt (6.8 kg) batch",
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
