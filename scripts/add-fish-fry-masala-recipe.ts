/**
 * Add "Fish Fry Masala" internal prep item under Raw Items + coating batch recipe.
 * Run: npx tsx scripts/add-fish-fry-masala-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "fish-fry-masala";
const VARIATION_ID = "fish-fry-masala";
const CATEGORY_ID = "raw-items";
/** Sum of all gram-based ingredient weights (eggs in pc). */
const YIELD_BATCH_G = 5471;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnjcrx4006ypm0inq73zxvt", qtyBase: 5000, note: "Fish (1 pkt = 5 kg)" },
  { inventoryItemId: "cmrnc0867003qpm0impd2ulfy", qtyBase: 15, note: "Fish Fry Masala" },
  { inventoryItemId: "cmrnc0vl1003rpm0iqokmowsu", qtyBase: 10, note: "Zeera Powder" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 11, note: "Garam Masala" },
  { inventoryItemId: "cmrrdsjtf00djnz0iagybauyt", qtyBase: 3, note: "Turmeric" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 10, note: "Meat Masala" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 10, note: "Kitchen King" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 20, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrndch830056pm0iyhz7ihng", qtyBase: 2, note: "Ajwain" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 30, note: "Salt" },
  { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 100, note: "Maida" },
  { inventoryItemId: "cmrnd28cl004qpm0iptx93rjv", qtyBase: 160, note: "Corn Flour" },
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", qtyBase: 100, note: "Ginger Garlic Paste" },
  { inventoryItemId: "cmrre0qac00fcnz0i7yfp4qkz", qtyBase: 2, note: "Egg" },
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
        name: "Fish Fry Masala",
        description:
          "Fish fry prep — internal batch for 1 pkt fish (5 kg); half 20 plates, full 14 plates.",
        image: "/menu/fried-fish.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 4,
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
        label: "Fish Fry Masala — 5 kg fish batch",
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
