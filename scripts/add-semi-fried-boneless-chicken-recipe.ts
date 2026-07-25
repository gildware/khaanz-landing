/**
 * Add Semi Fried Boneless Chicken batch recipe (4 pkt / 6.8 kg chicken).
 * Run: npx tsx scripts/add-semi-fried-boneless-chicken-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "semi-fried-boneless-chicken";
const VARIATION_ID = "semi-fried-boneless-chicken";
/** Batch yield in grams — sum of all ingredient weights (g). Eggs are counted in pc. */
const YIELD_BATCH_G = 7325;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnjc020006xpm0ijsppiu4v", qtyBase: 6800, note: "Chicken Boneless" },
  { inventoryItemId: "cmrnbxiv2003mpm0icrqc4un7", qtyBase: 8, note: "Corriandor Powder" },
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
  { inventoryItemId: "cms0lphcb0000vupdmz5uj2e5", qtyBase: 2, note: "Food Colour" },
];

async function main() {
  const prisma = getPrisma();

  const menuItem = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (!menuItem) {
    console.error(`Menu item "${MENU_ITEM_ID}" not found — run add-chicken-roll-masala-recipe.ts first.`);
    process.exit(1);
  }

  const existing = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MENU_ITEM_ID, variationId: VARIATION_ID },
  });
  if (existing) {
    console.error("Recipe already exists:", existing.id);
    process.exit(1);
  }

  const invIds = RECIPE_LINES.map((l) => l.inventoryItemId);
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: invIds }, active: true },
    select: { id: true, name: true, baseUnit: true },
  });
  if (found.length !== invIds.length) {
    console.error(
      "Missing inventory items:",
      invIds.filter((id) => !found.some((f) => f.id === id)),
    );
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: MENU_ITEM_ID },
      data: {
        description:
          "Semi-fried boneless chicken prep — internal component (4 pkt / 6.8 kg batch).",
      },
    });

    const recipe = await tx.recipeVersion.create({
      data: {
        menuItemId: MENU_ITEM_ID,
        variationId: VARIATION_ID,
        effectiveFrom: new Date(),
        label: "Semi Fried Boneless Chicken — 4 pkt (6.8 kg) batch",
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

    return recipe;
  });

  console.log("Created recipe:", result.id, result.label);
  console.log(`Yield: ${YIELD_BATCH_G} g`);
  console.log("Ingredients (full batch):");
  for (const ing of result.ingredients) {
    console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
