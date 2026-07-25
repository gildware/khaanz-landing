/**
 * Add Pizza Dough, Naan Dough, Roll Dough under Raw Items.
 * Run: npx tsx scripts/add-dough-recipes.ts
 */
import { getPrisma } from "../src/lib/prisma";

const CATEGORY_ID = "raw-items";

const DOUGHS = [
  {
    menuItemId: "pizza-dough",
    variationId: "pizza-dough",
    name: "Pizza Dough",
    description: "Pizza dough prep — internal batch (5 kg yield; med 200 g).",
    image: "/menu/cheesy-bliss-pizza.jpg",
    isVeg: true,
    sortOrder: 6,
    label: "Pizza Dough — 5 kg batch",
    yieldG: 5000,
    lines: [
      { inventoryItemId: "cmrnd4z4c004tpm0ihnkqamfi", qtyBase: 20, note: "Yeast" },
      { inventoryItemId: "cmrqlbs8k001vnz0i3exjo54d", qtyBase: 40, note: "Sugar" },
      { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 35, note: "Salt" },
      { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 3330, note: "Maida" },
      { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", qtyBase: 20, note: "Oil" },
      // Water added by add-dough-water.ts (1555 ml → 5 kg yield)
    ],
  },
  {
    menuItemId: "naan-dough",
    variationId: "naan-dough",
    name: "Naan Dough",
    description: "Naan dough prep — internal batch (4.5 kg yield).",
    image: "/menu/butter-garlic-naan.jpg",
    isVeg: true,
    sortOrder: 7,
    label: "Naan Dough — 4.5 kg batch",
    yieldG: 4500,
    lines: [
      { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 2500, note: "Maida" },
      { inventoryItemId: "cms0nmawt02vtpp0i1ei9jkry", qtyBase: 10, note: "Kalonji" },
      { inventoryItemId: "cmrrdtwrf00donz0i1wgwv07z", qtyBase: 10, note: "Dhaniya" },
      { inventoryItemId: "cmrndlx4s005bpm0i3x855m8s", qtyBase: 6, note: "Oil" },
      // Water added by add-dough-water.ts (1974 ml → 4.5 kg yield)
    ],
  },
  {
    menuItemId: "roll-dough",
    variationId: "roll-dough",
    name: "Roll Dough",
    description: "Roll dough prep — internal batch (1.5 kg maida + 1 egg).",
    image: "/menu/chicken-roll.jpg",
    isVeg: false,
    sortOrder: 8,
    label: "Roll Dough — batch",
    yieldG: 1500,
    lines: [
      { inventoryItemId: "cmrnd2iym004rpm0ib3bxcrn5", qtyBase: 1500, note: "Maida" },
      { inventoryItemId: "cmrre0qac00fcnz0i7yfp4qkz", qtyBase: 1, note: "Egg" },
    ],
  },
] as const;

async function main() {
  const prisma = getPrisma();

  const category = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM categories WHERE id = ${CATEGORY_ID} LIMIT 1
  `;
  if (category.length === 0) {
    console.error(`Category "${CATEGORY_ID}" not found.`);
    process.exit(1);
  }

  for (const dough of DOUGHS) {
    const existing = await prisma.menuItem.findUnique({
      where: { id: dough.menuItemId },
    });
    if (existing) {
      console.error(`Menu item "${dough.menuItemId}" already exists — aborting.`);
      process.exit(1);
    }

    const invIds = dough.lines.map((l) => l.inventoryItemId);
    const found = await prisma.inventoryItem.findMany({
      where: { id: { in: invIds }, active: true },
      select: { id: true, name: true },
    });
    if (found.length !== invIds.length) {
      console.error(
        `Missing inventory for ${dough.name}:`,
        invIds.filter((id) => !found.some((f) => f.id === id)),
      );
      process.exit(1);
    }

    const result = await prisma.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.create({
        data: {
          id: dough.menuItemId,
          categoryId: CATEGORY_ID,
          name: dough.name,
          description: dough.description,
          image: dough.image,
          isVeg: dough.isVeg,
          recommended: false,
          available: false,
          notForSale: true,
          sortOrder: dough.sortOrder,
          variations: {
            create: {
              id: dough.variationId,
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
          variationId: dough.variationId,
          effectiveFrom: new Date(),
          label: dough.label,
          yieldQty: dough.yieldG,
          yieldUnit: "g",
          ingredients: {
            create: dough.lines.map((line) => ({
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

    console.log(`\nCreated: ${result.menuItem.name}`);
    console.log(`Recipe: ${result.recipe.label}`);
    console.log(`Yield: ${dough.yieldG} g`);
    for (const ing of result.recipe.ingredients) {
      console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
