/**
 * Add "Indian Gravy" internal prep item under Raw Items + 11.5 kg batch recipe.
 * Run: npx tsx scripts/add-indian-gravy-recipe.ts
 */
import { PrismaClient } from "@prisma/client";

const MENU_ITEM_ID = "indian-gravy";
const VARIATION_ID = "indian-gravy";
const CATEGORY_ID = "raw-items";
const YIELD_BATCH_G = 11500;

/** Full batch quantities in grams (from kitchen recipe sheet). */
const RECIPE_LINES: { inventoryItemId: string; batchG: number; note: string }[] = [
  { inventoryItemId: "cmrnf1omg006ppm0ibm5xfpti", batchG: 7300, note: "Onion" },
  { inventoryItemId: "cmrqfbr920008mt0if2u0i0lm", batchG: 1000, note: "Tomato" },
  { inventoryItemId: "cmrnd9fw8004ypm0iikfuu8ue", batchG: 500, note: "Cashew" },
  { inventoryItemId: "cmrnd9pua004zpm0inbb4ar18", batchG: 250, note: "Magz" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", batchG: 25, note: "Garam Masala" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", batchG: 30, note: "Meat Masala" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", batchG: 30, note: "Kitchen King" },
  { inventoryItemId: "cmrnbxiv2003mpm0icrqc4un7", batchG: 15, note: "Corriandor Powder" },
  { inventoryItemId: "cmrnc0vl1003rpm0iqokmowsu", batchG: 10, note: "Zeera Powder" },
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", batchG: 200, note: "Ginger Garlic Paste" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", batchG: 50, note: "Salt" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", batchG: 3, note: "Kasoori Methi" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", batchG: 10, note: "Ajina Moto" },
  { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", batchG: 900, note: "Oil" },
  { inventoryItemId: "cmrrdsjtf00djnz0iagybauyt", batchG: 5, note: "Turmeric" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", batchG: 30, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrt9mf690adbpc0i1a3v49t2", batchG: 10, note: "Dal Cheeni" },
  { inventoryItemId: "cmrnda3lt0050pm0iwqueht3r", batchG: 6, note: "Clove" },
  { inventoryItemId: "cmrndan7r0051pm0ih1fajpfb", batchG: 2, note: "Cardamom" },
  { inventoryItemId: "cmrndc72i0055pm0i8s1wdoc4", batchG: 3, note: "Star Masala" },
  { inventoryItemId: "cmrndhtic0059pm0ipe644ijc", batchG: 3, note: "Tej Patta" },
];

async function main() {
  const prisma = new PrismaClient();

  const category = await prisma.category.findUnique({ where: { id: CATEGORY_ID } });
  if (!category) {
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
        name: "Indian Gravy",
        description:
          "Base Indian gravy — internal prep component (11.5 kg batch; half 250 g, full 430 g).",
        image: "/menu/butter-chicken.jpg",
        isVeg: true,
        recommended: false,
        available: false,
        sortOrder: 0,
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
        label: "Indian Gravy — 11.5 kg batch",
        yieldQty: YIELD_BATCH_G,
        yieldUnit: "g",
        ingredients: {
          create: RECIPE_LINES.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            qtyBase: line.batchG,
          })),
        },
      },
      include: {
        ingredients: { include: { item: { select: { name: true } } } },
      },
    });

    return { menuItem, recipe };
  });

  console.log("Created menu item:", result.menuItem.id, result.menuItem.name);
  console.log("Category:", CATEGORY_ID);
  console.log("Created recipe:", result.recipe.id, result.recipe.label);
  console.log(`Yield: ${YIELD_BATCH_G} g`);
  console.log("Ingredients (full batch):");
  for (const ing of result.recipe.ingredients) {
    console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} g`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
