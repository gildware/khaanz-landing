/**
 * One-off: add base "Momo" menu item + per-piece recipe (3800 batch).
 * Run: npx tsx scripts/add-momo-recipe.ts
 */
import { PrismaClient } from "@prisma/client";

const YIELD_BATCH = 3800;

function perMomoQty(batchG: number): number {
  return Math.round((batchG / YIELD_BATCH) * 100) / 100;
}

/** Batch grams → per-momo grams (qtyBase in inventory base unit g). */
const RECIPE_LINES: { inventoryItemId: string; batchG: number }[] = [
  { inventoryItemId: "cmrnjc020006xpm0ijsppiu4v", batchG: 13000 }, // Chicken Boneless
  { inventoryItemId: "cmrnd1k4o004ppm0ijcinflvs", batchG: 13 * 135 }, // Soya Granules
  { inventoryItemId: "cmrnf1omg006ppm0ibm5xfpti", batchG: 6500 }, // Onion
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", batchG: 200 }, // Kitchen King
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", batchG: 100 }, // Garam Masala
  { inventoryItemId: "cmrnbwub5003lpm0il5jfztag", batchG: 50 }, // Black Pepper Powder
  { inventoryItemId: "cmrnc9iq5003xpm0ipv2ivve0", batchG: 1.5 * 50 }, // Momos Masala
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", batchG: 100 }, // Meat Masala
  { inventoryItemId: "cmrnceedm0044pm0i6l53xkdq", batchG: 0.5 * 650 }, // Green Chilli Sauce
  { inventoryItemId: "cmrncf1ud0045pm0ifasc8uy3", batchG: 0.25 * 740 }, // Soya Sauce
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", batchG: 500 }, // Ajina Moto: 1 pkt (1/2 kg)
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", batchG: 500 }, // Salt
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", batchG: 250 }, // Green Chilli
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", batchG: 250 }, // Red Chilli Powder
  { inventoryItemId: "cmrnjehqe006zpm0i2ttjdcp8", batchG: 1000 }, // Ghee
  { inventoryItemId: "cmrrdtwrf00donz0i1wgwv07z", batchG: 250 }, // Dhaniya
  { inventoryItemId: "cmrru0wt300pgnz0i0eaxt7l7", batchG: 200 }, // Ginger Garlic Paste
];

const MOMO_ADDONS = [
  { addonKey: "ia-spicy-chutney", name: "Extra Spicy Chutney", price: 15, sortOrder: 0 },
  { addonKey: "ia-mayo-dip", name: "Mayo Dip", price: 20, sortOrder: 1 },
  { addonKey: "ia-schezwan-dip", name: "Schezwan Dip", price: 20, sortOrder: 2 },
] as const;

async function main() {
  const prisma = new PrismaClient();

  const existing = await prisma.menuItem.findUnique({ where: { id: "momo" } });
  if (existing) {
    console.error('Menu item "momo" already exists — aborting.');
    process.exit(1);
  }

  const invIds = RECIPE_LINES.map((l) => l.inventoryItemId);
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: invIds }, active: true },
    select: { id: true, name: true },
  });
  if (found.length !== invIds.length) {
    console.error("Missing inventory items:", invIds.filter((id) => !found.some((f) => f.id === id)));
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    const menuItem = await tx.menuItem.create({
      data: {
        id: "momo",
        categoryId: "momo-mania",
        name: "Momo",
        description: "Base momo filling — internal recipe component (3800 batch).",
        image: "/menu/steamed-chicken-momo.jpg",
        isVeg: false,
        recommended: false,
        available: false,
        sortOrder: 21,
        variations: {
          create: {
            id: "momo",
            name: "Piece",
            price: 0,
            sortOrder: 0,
          },
        },
        addons: {
          create: MOMO_ADDONS.map((a) => ({ ...a })),
        },
      },
    });

    const recipe = await tx.recipeVersion.create({
      data: {
        menuItemId: menuItem.id,
        variationId: "momo",
        effectiveFrom: new Date(),
        label: "Base momo — 3800 batch / 1 pc",
        yieldQty: 1,
        yieldUnit: "",
        ingredients: {
          create: RECIPE_LINES.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            qtyBase: perMomoQty(line.batchG),
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
  console.log("Created recipe:", result.recipe.id, result.recipe.label);
  console.log("Ingredients (per 1 momo):");
  for (const ing of result.recipe.ingredients) {
    console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} g`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
