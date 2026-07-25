/**
 * Add Mango Blast shake recipe.
 * Run: npx tsx scripts/add-mango-blast-recipe.ts
 */
import { PrismaClient } from "@prisma/client";

const MENU_ITEM_ID = "mango-blast";
const VARIATION_ID = "mango-blast";

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnesdvu006hpm0i0ldnh9kw", qtyBase: 40, note: "Mango Crush (ml)" },
  { inventoryItemId: "cmrnf09to006npm0i1kw44i8e", qtyBase: 105, note: "Mango Gallon — 3 scoops × 35 g" },
  { inventoryItemId: "cmrnd6ea5004vpm0itg67chsu", qtyBase: 180, note: "Milk (ml)" },
];

async function main() {
  const prisma = new PrismaClient();

  const menuItem = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (!menuItem) {
    console.error(`Menu item "${MENU_ITEM_ID}" not found.`);
    process.exit(1);
  }

  const existing = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MENU_ITEM_ID, variationId: VARIATION_ID },
  });
  if (existing) {
    console.error("Mango Blast recipe already exists:", existing.id);
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

  const recipe = await prisma.recipeVersion.create({
    data: {
      menuItemId: MENU_ITEM_ID,
      variationId: VARIATION_ID,
      effectiveFrom: new Date(),
      label: "Mango Blast — 1 shake",
      yieldQty: 1,
      yieldUnit: "",
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

  console.log("Created recipe:", recipe.id, recipe.label);
  for (const ing of recipe.ingredients) {
    console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
