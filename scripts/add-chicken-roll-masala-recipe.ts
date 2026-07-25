/**
 * Add Semi Fried Boneless Chicken (prep placeholder) + Chicken Roll Masala batch recipe.
 * Run: npx tsx scripts/add-chicken-roll-masala-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const CATEGORY_ID = "raw-items";

const SEMI_FRIED_ID = "semi-fried-boneless-chicken";
const SEMI_FRIED_VARIATION_ID = "semi-fried-boneless-chicken";

const CHICKEN_ROLL_MASALA_ID = "chicken-roll-masala";
const CHICKEN_ROLL_MASALA_VARIATION_ID = "chicken-roll-masala";
const YIELD_BATCH_G = 1400;
const SEMI_FRIED_COMPONENT_G = 500;

/** Full batch quantities in grams (from kitchen recipe sheet). */
const INVENTORY_LINES: { inventoryItemId: string; batchG: number; note: string }[] = [
  { inventoryItemId: "cmrnf2n40006rpm0id74i3lld", batchG: 500, note: "Cabbage" },
  { inventoryItemId: "cmrnf767r006vpm0ii5w1e90r", batchG: 60, note: "Carrot" },
  { inventoryItemId: "cmrnf1omg006ppm0ibm5xfpti", batchG: 500, note: "Onion" },
  { inventoryItemId: "cmrnf5c1g006spm0i0gufi4tl", batchG: 60, note: "Capsicum" },
  { inventoryItemId: "cmrnceedm0044pm0i6l53xkdq", batchG: 35, note: "Green Chilli Sauce" },
  { inventoryItemId: "cmrncf1ud0045pm0ifasc8uy3", batchG: 6, note: "Soya Sauce" },
  { inventoryItemId: "cmrncdrem0043pm0itxtmr9s5", batchG: 53, note: "Tomato Sauce" },
  { inventoryItemId: "cmrncd9t00042pm0igyi8046s", batchG: 80, note: "Schezwan Sauce" },
  { inventoryItemId: "cmrncg9eb0046pm0itpq88e7a", batchG: 3, note: "Vinegar" },
  { inventoryItemId: "cmrnc8tw2003vpm0im5b4zofq", batchG: 4, note: "White Pepper" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", batchG: 15, note: "Salt" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", batchG: 7, note: "Ajina Moto" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", batchG: 67, note: "Green Chilli" },
  { inventoryItemId: "cmrnf61pk006upm0i86gscph7", batchG: 36, note: "Garlic" },
  { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", batchG: 72, note: "Oil" },
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

  const invIds = INVENTORY_LINES.map((l) => l.inventoryItemId);
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

  const existingSemi = await prisma.menuItem.findUnique({ where: { id: SEMI_FRIED_ID } });
  const existingMasala = await prisma.menuItem.findUnique({
    where: { id: CHICKEN_ROLL_MASALA_ID },
  });
  if (existingSemi || existingMasala) {
    console.error("One or both menu items already exist — aborting.");
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    const semiFried = await tx.menuItem.create({
      data: {
        id: SEMI_FRIED_ID,
        categoryId: CATEGORY_ID,
        name: "Semi Fried Boneless Chicken",
        description:
          "Semi-fried boneless chicken prep — internal component (recipe to be added).",
        image: "/menu/fried-chicken.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        sortOrder: 1,
        variations: {
          create: {
            id: SEMI_FRIED_VARIATION_ID,
            name: "Batch",
            price: 0,
            sortOrder: 0,
          },
        },
      },
    });

    const chickenRollMasala = await tx.menuItem.create({
      data: {
        id: CHICKEN_ROLL_MASALA_ID,
        categoryId: CATEGORY_ID,
        name: "Chicken Roll Masala",
        description:
          "Chicken roll filling masala — internal prep (1.4 kg batch; 150 g per roll).",
        image: "/menu/chicken-roll.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        sortOrder: 2,
        variations: {
          create: {
            id: CHICKEN_ROLL_MASALA_VARIATION_ID,
            name: "Batch",
            price: 0,
            sortOrder: 0,
          },
        },
      },
    });

    const recipe = await tx.recipeVersion.create({
      data: {
        menuItemId: chickenRollMasala.id,
        variationId: CHICKEN_ROLL_MASALA_VARIATION_ID,
        effectiveFrom: new Date(),
        label: "Chicken Roll Masala — 1.4 kg batch",
        yieldQty: YIELD_BATCH_G,
        yieldUnit: "g",
        ingredients: {
          create: [
            {
              componentMenuItemId: SEMI_FRIED_ID,
              componentVariationId: SEMI_FRIED_VARIATION_ID,
              qtyBase: SEMI_FRIED_COMPONENT_G,
            },
            ...INVENTORY_LINES.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              qtyBase: line.batchG,
            })),
          ],
        },
      },
      include: {
        ingredients: {
          include: {
            item: { select: { name: true } },
            componentMenuItem: { select: { name: true } },
          },
        },
      },
    });

    return { semiFried, chickenRollMasala, recipe };
  });

  console.log("Created prep item:", result.semiFried.id, result.semiFried.name, "(no recipe yet)");
  console.log("Created menu item:", result.chickenRollMasala.id, result.chickenRollMasala.name);
  console.log("Created recipe:", result.recipe.id, result.recipe.label);
  console.log(`Yield: ${YIELD_BATCH_G} g`);
  console.log("Ingredients (full batch):");
  for (const ing of result.recipe.ingredients) {
    if (ing.componentMenuItem) {
      console.log(`  ${ing.componentMenuItem.name}: ${ing.qtyBase.toString()} g (menu component)`);
    } else {
      console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} g`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
