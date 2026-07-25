/**
 * Add Kit Kat Milkshake recipe.
 * Run: npx tsx scripts/add-kitkat-milkshake-recipe.ts
 */
import { PrismaClient } from "@prisma/client";

const MENU_ITEM_ID = "kit-kat-milkshake";
const VARIATION_ID = "kit-kat-milkshake";

/** Chocolate syrup: 20 ml total (main + garnish) → stored as g (≈1 ml = 1 g). */
const SYRUP_ML = 20;

const RECIPE_LINES: { inventoryItemId: string; qtyBase: number; note: string }[] = [
  { inventoryItemId: "cmrnere64006fpm0ibm5h7jg5", qtyBase: 4, note: "Kit Kat (pc)" },
  { inventoryItemId: "cmrnd6ea5004vpm0itg67chsu", qtyBase: 180, note: "Milk (ml)" },
  {
    inventoryItemId: "cmrnerwol006gpm0izpbghum8",
    qtyBase: SYRUP_ML,
    note: `Chocolate Syrup (${SYRUP_ML} ml ≈ ${SYRUP_ML} g)`,
  },
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
    console.error("Kit Kat Milkshake recipe already exists:", existing.id);
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
      label: "Kit Kat Milkshake — 1 shake",
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
