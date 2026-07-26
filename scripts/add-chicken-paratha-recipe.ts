/**
 * Add Chicken Paratha per-piece recipe (58 g mix + atta dough + sides).
 * Run: npx tsx scripts/add-chicken-paratha-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "chicken-paratha";
const VARIATION_ID = "chicken-paratha";
const MIX_ID = "raw-chicken-parath-mix";
const ATTA_DOUGH_ID = "item-ms1ndldj";
const RAITA_ID = "raita";
const BUTTER_ID = "cmrnd78n2004wpm0iv6o104i3";
const PICKLE_ID = "cmrnclj7b004apm0ic1qvz8nh";

const RECIPE_LINES: {
  inventoryItemId?: string;
  componentMenuItemId?: string;
  qtyBase: number;
  note: string;
}[] = [
  { componentMenuItemId: MIX_ID, qtyBase: 58, note: "Raw Chicken Parath Mix" },
  { componentMenuItemId: ATTA_DOUGH_ID, qtyBase: 200, note: "Atta Dough" },
  { inventoryItemId: BUTTER_ID, qtyBase: 1, note: "Butter" },
  { componentMenuItemId: RAITA_ID, qtyBase: 50, note: "Raita" },
  { inventoryItemId: PICKLE_ID, qtyBase: 50, note: "Pickle" },
];

async function main() {
  const prisma = getPrisma();

  const menuItem = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (!menuItem) {
    console.error(`Menu item "${MENU_ITEM_ID}" not found.`);
    process.exit(1);
  }

  const mix = await prisma.menuItem.findUnique({ where: { id: MIX_ID } });
  if (!mix) {
    console.error(`Raw mix "${MIX_ID}" not found — run add-raw-chicken-parath-mix-recipe.ts first.`);
    process.exit(1);
  }

  const existing = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MENU_ITEM_ID, variationId: VARIATION_ID },
  });
  if (existing) {
    console.error("Chicken Paratha recipe already exists:", existing.id);
    process.exit(1);
  }

  const invIds = RECIPE_LINES.map((l) => l.inventoryItemId).filter(Boolean) as string[];
  const componentIds = RECIPE_LINES.map((l) => l.componentMenuItemId).filter(Boolean) as string[];

  const [foundInv, foundComponents] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { id: { in: invIds }, active: true },
      select: { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, name: true },
    }),
  ]);

  if (foundInv.length !== invIds.length) {
    console.error(
      "Missing inventory items:",
      invIds.filter((id) => !foundInv.some((f) => f.id === id)),
    );
    process.exit(1);
  }
  if (foundComponents.length !== componentIds.length) {
    console.error(
      "Missing component menu items:",
      componentIds.filter((id) => !foundComponents.some((f) => f.id === id)),
    );
    process.exit(1);
  }

  const result = await prisma.recipeVersion.create({
    data: {
      menuItemId: MENU_ITEM_ID,
      variationId: VARIATION_ID,
      effectiveFrom: new Date(),
      label: "Chicken Paratha — single",
      yieldQty: 1,
      yieldUnit: "pc",
      ingredients: {
        create: RECIPE_LINES.map((line) => ({
          inventoryItemId: line.inventoryItemId ?? null,
          componentMenuItemId: line.componentMenuItemId ?? null,
          qtyBase: line.qtyBase,
        })),
      },
    },
    include: {
      ingredients: {
        include: {
          item: { select: { name: true, baseUnit: true } },
          componentMenuItem: { select: { name: true } },
        },
      },
    },
  });

  console.log("Created recipe:", result.id, result.label);
  console.log("Ingredients (per paratha):");
  for (const ing of result.ingredients) {
    if (ing.componentMenuItem) {
      console.log(`  ${ing.componentMenuItem.name}: ${ing.qtyBase.toString()} g`);
    } else {
      console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
