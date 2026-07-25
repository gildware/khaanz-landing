/**
 * Add "Red Chutni" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-red-chutni-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "red-chutni";
const VARIATION_ID = "red-chutni";
const CATEGORY_ID = "raw-items";
/** Sum of all ingredient weights (g). */
const YIELD_BATCH_G = 10850;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrqfbr920008mt0if2u0i0lm", qtyBase: 5000, note: "Tomato" },
  { inventoryItemId: "cmrnd5pjd004upm0i9ko55yld", qtyBase: 1000, note: "Pipla Mirchi" },
  { inventoryItemId: "cmrnf61pk006upm0i86gscph7", qtyBase: 800, note: "Garlic" },
  { inventoryItemId: "cmrrdtwrf00donz0i1wgwv07z", qtyBase: 1000, note: "Dhaniya" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 500, note: "Ajina Moto (1 pkt = 0.5 kg)" },
  { inventoryItemId: "cmrnbwub5003lpm0il5jfztag", qtyBase: 100, note: "Black Pepper Powder (2 pkt = 100 g)" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 1000, note: "Salt (1 pkt = 1 kg)" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 650, note: "Green Chilli" },
  { inventoryItemId: "cmrnd28cl004qpm0iptx93rjv", qtyBase: 800, note: "Corn Flour" },
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
        name: "Red Chutni",
        description: "Red chutney prep — internal component (10.85 kg batch).",
        image: "/menu/chilli-chicken.jpg",
        isVeg: true,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: 3,
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
        label: "Red Chutni — 10.85 kg batch",
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
