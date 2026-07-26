/**
 * Add "Peri Peri Marinade" internal prep item under Raw Items + batch recipe.
 * Run: npx tsx scripts/add-peri-peri-marinade-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "peri-peri-marinade";
const VARIATION_ID = "peri-peri-marinade";
const CATEGORY_ID = "raw-items";
/** Sum of gram-based ingredient weights (chili flakes sachet in pc). */
const YIELD_BATCH_G = 1072;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrthq7wu0eqwpc0ix1qi4tz6", qtyBase: 500, note: "Curd" },
  { inventoryItemId: "cmrncqw8f004ipm0itwqwcprk", qtyBase: 50, note: "Peri Peri Masla" },
  { inventoryItemId: "cms1ixgi40001vubeyauusz6w", qtyBase: 12, note: "Garlic powder" },
  { inventoryItemId: "cmrnd5pjd004upm0i9ko55yld", qtyBase: 10, note: "Pipla Mirchi" },
  { inventoryItemId: "cms1j2vtn0002vubeasje31r7", qtyBase: 1, note: "Chili flakes Sachet" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 30, note: "Salt" },
  { inventoryItemId: "cmrrdsjtf00djnz0iagybauyt", qtyBase: 3, note: "Turmeric" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 5, note: "Ajina Moto" },
  { inventoryItemId: "cms1iwkds0000vubetplczy00", qtyBase: 20, note: "Aromatic Mix" },
  { inventoryItemId: "cmrncf1ud0045pm0ifasc8uy3", qtyBase: 12, note: "Soya Sauce" },
  { inventoryItemId: "cmrncdrem0043pm0itxtmr9s5", qtyBase: 30, note: "Tomato Sauce" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 50, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", qtyBase: 50, note: "Ginger Garlic Paste" },
  { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", qtyBase: 45, note: "Oil" },
  { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 250, note: "Maida (coating)" },
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
        name: "Peri Peri Marinade",
        description:
          "Peri peri chicken marinade + maida coating — internal batch (1072 g) for strips, wings, popcorn, crispy, and burger prep.",
        image: "/menu/peri-peri-fries.jpg",
        isVeg: false,
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
        label: "Peri Peri Marinade — full batch",
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
