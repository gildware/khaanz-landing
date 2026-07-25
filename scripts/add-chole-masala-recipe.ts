/**
 * Add "Chole Masala" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-chole-masala-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "chole-masala";
const VARIATION_ID = "chole-masala";
const CATEGORY_ID = "raw-items";
/** Sum of all ingredient weights (g). */
const YIELD_BATCH_G = 634;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnbznf4003ppm0i4odl8xfe", qtyBase: 15, note: "Channa Masala" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 12, note: "Garam Masala" },
  { inventoryItemId: "cmrnbxiv2003mpm0icrqc4un7", qtyBase: 7, note: "Corriandor Powder" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 16, note: "Kitchen King" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 10, note: "Meat Masala" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", qtyBase: 1, note: "Kasoori Methi" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 21, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 36, note: "Salt" },
  { inventoryItemId: "cmrndan7r0051pm0ih1fajpfb", qtyBase: 1, note: "Cardamom (Elaichi)" },
  { inventoryItemId: "cmrndhtic0059pm0ipe644ijc", qtyBase: 5, note: "Tej Patta" },
  { inventoryItemId: "cmrt9mf690adbpc0i1a3v49t2", qtyBase: 10, note: "Dal Cheeni" },
  { inventoryItemId: "cmrnf1omg006ppm0ibm5xfpti", qtyBase: 300, note: "Onion" },
  { inventoryItemId: "cmrqfbr920008mt0if2u0i0lm", qtyBase: 150, note: "Tomato" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 50, note: "Green Chilli" },
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
        name: "Chole Masala",
        description: "Chole masala prep — internal component (634 g batch).",
        image: "/menu/chole.jpg",
        isVeg: true,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 5,
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
        label: "Chole Masala — batch",
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
