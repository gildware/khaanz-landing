/**
 * Add Special Chicken half + full recipes (kitchen recipe sheet).
 * Same as Butter Chicken minus gravy, plus 2 eggs per portion.
 * Run: npx tsx scripts/add-special-chicken-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "special-chicken";
const BOILED_CHICKEN_ID = "boiled-chicken";

type RecipeLine = {
  inventoryItemId?: string;
  componentMenuItemId?: string;
  componentVariationId?: string;
  qtyBase: number;
  note: string;
};

const HALF_LINES: RecipeLine[] = [
  {
    componentMenuItemId: BOILED_CHICKEN_ID,
    componentVariationId: BOILED_CHICKEN_ID,
    qtyBase: 250,
    note: "Boiled Chicken",
  },
  { inventoryItemId: "cmrre0qac00fcnz0i7yfp4qkz", qtyBase: 2, note: "Egg" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 0.5, note: "Kitchen King" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 0.5, note: "Meat Masala" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 0.5, note: "Garam Masala" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", qtyBase: 1, note: "Kasoori Methi" },
  { inventoryItemId: "cmrnd8ee1004xpm0i8pr8rtlj", qtyBase: 30, note: "Fresh Cream" },
  { inventoryItemId: "cmrnd78n2004wpm0iv6o104i3", qtyBase: 2, note: "Butter" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 6, note: "Green Chilli" },
  { inventoryItemId: "cmrnf61pk006upm0i86gscph7", qtyBase: 5, note: "Garlic" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 1, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 1, note: "Salt" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 1, note: "Ajina Moto" },
];

const FULL_LINES: RecipeLine[] = [
  {
    componentMenuItemId: BOILED_CHICKEN_ID,
    componentVariationId: BOILED_CHICKEN_ID,
    qtyBase: 500,
    note: "Boiled Chicken",
  },
  { inventoryItemId: "cmrre0qac00fcnz0i7yfp4qkz", qtyBase: 2, note: "Egg" },
  { inventoryItemId: "cmrnc6024003upm0i4v4na9mp", qtyBase: 1, note: "Kitchen King" },
  { inventoryItemId: "cmrnc1owo003spm0ixst3u3aa", qtyBase: 1, note: "Meat Masala" },
  { inventoryItemId: "cmrnc4zyb003tpm0io1vo1o7g", qtyBase: 1, note: "Garam Masala" },
  { inventoryItemId: "cmrnbyebv003npm0irzwqooih", qtyBase: 2, note: "Kasoori Methi" },
  { inventoryItemId: "cmrnd8ee1004xpm0i8pr8rtlj", qtyBase: 60, note: "Fresh Cream" },
  { inventoryItemId: "cmrnd78n2004wpm0iv6o104i3", qtyBase: 3, note: "Butter" },
  { inventoryItemId: "cmrnf5oxg006tpm0im1gjj21d", qtyBase: 9, note: "Green Chilli" },
  { inventoryItemId: "cmrnf61pk006upm0i86gscph7", qtyBase: 9, note: "Garlic" },
  { inventoryItemId: "cmrncbtds0041pm0ifuzdyb56", qtyBase: 2, note: "Red Chilli Powder" },
  { inventoryItemId: "cmrncauuq003zpm0if3izwody", qtyBase: 2, note: "Salt" },
  { inventoryItemId: "cmrncb7t70040pm0iy7rwhpdt", qtyBase: 2, note: "Ajina Moto" },
];

const RECIPES = [
  { variationId: "special-chicken-half", label: "Special Chicken — Half", lines: HALF_LINES },
  { variationId: "special-chicken-full", label: "Special Chicken — Full", lines: FULL_LINES },
] as const;

async function validateLines(prisma: ReturnType<typeof getPrisma>, lines: RecipeLine[]) {
  const invIds = lines.map((l) => l.inventoryItemId).filter(Boolean) as string[];
  const componentIds = lines.map((l) => l.componentMenuItemId).filter(Boolean) as string[];

  const [foundInv, foundComponents] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { id: { in: invIds }, active: true },
      select: { id: true },
    }),
    prisma.menuItem.findMany({
      where: { id: { in: componentIds } },
      select: { id: true },
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
}

async function main() {
  const prisma = getPrisma();

  const menuItem = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (!menuItem) {
    console.error(`Menu item "${MENU_ITEM_ID}" not found.`);
    process.exit(1);
  }

  const prep = await prisma.menuItem.findUnique({ where: { id: BOILED_CHICKEN_ID } });
  if (!prep) {
    console.error(`Prep item missing: ${BOILED_CHICKEN_ID}`);
    process.exit(1);
  }

  for (const recipe of RECIPES) {
    const variation = await prisma.menuItemVariation.findUnique({
      where: { id: recipe.variationId },
    });
    if (!variation) {
      console.error(`Variation not found: ${recipe.variationId}`);
      process.exit(1);
    }

    const existing = await prisma.recipeVersion.findFirst({
      where: { menuItemId: MENU_ITEM_ID, variationId: recipe.variationId },
    });
    if (existing) {
      console.log(`Skip ${recipe.variationId} — recipe already exists (${existing.id})`);
      continue;
    }

    await validateLines(prisma, [...recipe.lines]);

    const created = await prisma.recipeVersion.create({
      data: {
        menuItemId: MENU_ITEM_ID,
        variationId: recipe.variationId,
        effectiveFrom: new Date(),
        label: recipe.label,
        yieldQty: 1,
        yieldUnit: "portion",
        ingredients: {
          create: recipe.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId ?? null,
            componentMenuItemId: line.componentMenuItemId ?? null,
            componentVariationId: line.componentVariationId ?? null,
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

    console.log(`Created ${recipe.variationId}:`, created.id, created.label);
    for (const ing of created.ingredients) {
      if (ing.componentMenuItem) {
        console.log(`  ${ing.componentMenuItem.name}: ${ing.qtyBase.toString()} g`);
      } else {
        console.log(`  ${ing.item?.name}: ${ing.qtyBase.toString()} ${ing.item?.baseUnit}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
