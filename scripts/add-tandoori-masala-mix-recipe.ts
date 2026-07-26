/**
 * Add "Tandoori Masala Mix" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-tandoori-masala-mix-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "tandoori-masala-mix";
const VARIATION_ID = "tandoori-masala-mix";
const CATEGORY_ID = "raw-items";
/** Sum of all ingredient weights (g). */
const YIELD_BATCH_G = 2548;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrthq7wu0eqwpc0ix1qi4tz6", qtyBase: 2000, note: "Curd (Dahi)" },
  { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", qtyBase: 150, note: "Oil" },
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", qtyBase: 115, note: "Ginger Garlic Paste" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 80, note: "Green Chilli" },
  { inventoryItemId: "cmrncac10003ypm0ia9fooj6h", qtyBase: 20, note: "Tandoori Masala" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 17, note: "Meat Masala" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 20, note: "Kitchen King" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 10, note: "Ajina Moto" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 30, note: "Salt" },
  { inventoryItemId: "cmrnbxiv2003mpm0icrqc4un7", qtyBase: 8, note: "Corriandor Powder (Dhaniya)" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 25, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 10, note: "Garam Masala" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", qtyBase: 3, note: "Kasoori Methi" },
  { inventoryItemId: "cmro7ufm90000nt0itjjbckcq", qtyBase: 60, note: "Lemon" },
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
        name: "Tandoori Masala Mix",
        description:
          "Tandoori marinade mix — internal batch (2 kg curd base, 2548 g total) for tandoori chicken prep.",
        image: "/menu/raw-items.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 10,
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
        label: "Tandoori Masala Mix — full batch",
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
