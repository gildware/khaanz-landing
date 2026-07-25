/**
 * Add / refresh all 8 shake recipes (1 per shake, yield = 1).
 * Run: npx tsx scripts/add-shake-recipes.ts
 */
import { getPrisma } from "../src/lib/prisma";

const SCOOP_G = 35;
const ICE_G = 50;
const MILK_ML = 180;

const IDS = {
  mangoCrush: "cmrnesdvu006hpm0i0ldnh9kw",
  mangoGallon: "cmrnf09to006npm0i1kw44i8e",
  blackCurrentCrush: "cmrnete1p006ipm0ik27gkmgp",
  blackCurrentGallon: "cmrnf0w7q006opm0i71ttx00c",
  vanillaGallon: "cmrnez41z006kpm0iot70vdh0",
  chocolateGallon: "cmrnezhyu006lpm0irw1rywwh",
  milk: "cmrnd6ea5004vpm0itg67chsu",
  iceCubes: "cms0o96ux02vvpp0in3r9i0iy",
  oreoBiscuit: "cmrnequr2006epm0ixt7e2y1v",
  chocolateSyrup: "cmrnerwol006gpm0izpbghum8",
  kitKat: "cmrnere64006fpm0ibm5h7jg5",
  strawberryCrush: "cmrnetv7p006jpm0itncdiyxx",
  strawberryGallon: "cmrnezy7u006mpm0i9cr32277",
  coffeeSachet: "cms0o8rtd02vupp0iep0ggu30",
} as const;

type Line = { inventoryItemId: string; qtyBase: number };

const SHAKES: {
  menuItemId: string;
  variationId: string;
  label: string;
  lines: Line[];
}[] = [
  {
    menuItemId: "mango-blast",
    variationId: "mango-blast",
    label: "Mango Blast — 1 shake",
    lines: [
      { inventoryItemId: IDS.mangoCrush, qtyBase: 30 },
      { inventoryItemId: IDS.mangoGallon, qtyBase: 3 * SCOOP_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
    ],
  },
  {
    menuItemId: "blackcurrent-blast",
    variationId: "blackcurrent-blast",
    label: "Blackcurrent Blast — 1 shake",
    lines: [
      { inventoryItemId: IDS.blackCurrentCrush, qtyBase: 30 },
      { inventoryItemId: IDS.blackCurrentGallon, qtyBase: 3 * SCOOP_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
    ],
  },
  {
    menuItemId: "oreo-biscuit",
    variationId: "oreo-biscuit",
    label: "Oreo Biscuit — 1 shake",
    lines: [
      { inventoryItemId: IDS.vanillaGallon, qtyBase: 2 * SCOOP_G },
      { inventoryItemId: IDS.chocolateGallon, qtyBase: 1 * SCOOP_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
      { inventoryItemId: IDS.oreoBiscuit, qtyBase: 1 },
      { inventoryItemId: IDS.chocolateSyrup, qtyBase: 30 },
    ],
  },
  {
    menuItemId: "kit-kat-milkshake",
    variationId: "kit-kat-milkshake",
    label: "Kit Kat Milkshake — 1 shake",
    lines: [
      { inventoryItemId: IDS.vanillaGallon, qtyBase: 2 * SCOOP_G },
      { inventoryItemId: IDS.chocolateGallon, qtyBase: 1 * SCOOP_G },
      { inventoryItemId: IDS.kitKat, qtyBase: 4 },
      { inventoryItemId: IDS.chocolateSyrup, qtyBase: 30 },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
    ],
  },
  {
    menuItemId: "true-vanilla",
    variationId: "true-vanilla",
    label: "True Vanilla — 1 shake",
    lines: [
      { inventoryItemId: IDS.vanillaGallon, qtyBase: 4 * SCOOP_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
      { inventoryItemId: IDS.chocolateSyrup, qtyBase: 30 },
    ],
  },
  {
    menuItemId: "cold-coffee",
    variationId: "cold-coffee",
    label: "Cold Coffee — 1 shake",
    lines: [
      { inventoryItemId: IDS.vanillaGallon, qtyBase: 3 * SCOOP_G },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.chocolateSyrup, qtyBase: 15 },
      { inventoryItemId: IDS.coffeeSachet, qtyBase: 1 },
    ],
  },
  {
    menuItemId: "strawberry-sweetness",
    variationId: "strawberry-sweetness",
    label: "Strawberry Sweetness — 1 shake",
    lines: [
      { inventoryItemId: IDS.strawberryCrush, qtyBase: 31 },
      { inventoryItemId: IDS.strawberryGallon, qtyBase: 3 * SCOOP_G },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
    ],
  },
  {
    menuItemId: "classic-chocolate",
    variationId: "classic-chocolate",
    label: "Classic Chocolate — 1 shake",
    lines: [
      { inventoryItemId: IDS.chocolateGallon, qtyBase: 3 * SCOOP_G },
      { inventoryItemId: IDS.milk, qtyBase: MILK_ML },
      { inventoryItemId: IDS.chocolateSyrup, qtyBase: 30 },
      { inventoryItemId: IDS.iceCubes, qtyBase: ICE_G },
    ],
  },
];

async function upsertShakeRecipe(
  shake: (typeof SHAKES)[number],
): Promise<void> {
  const prisma = getPrisma();

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: shake.menuItemId },
  });
  if (!menuItem) {
    throw new Error(`Menu item not found: ${shake.menuItemId}`);
  }

  const invIds = [...new Set(shake.lines.map((l) => l.inventoryItemId))];
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: invIds }, active: true },
    select: { id: true },
  });
  if (found.length !== invIds.length) {
    throw new Error(
      `Missing inventory for ${shake.menuItemId}: ${invIds.filter((id) => !found.some((f) => f.id === id)).join(", ")}`,
    );
  }

  const existing = await prisma.recipeVersion.findFirst({
    where: {
      menuItemId: shake.menuItemId,
      variationId: shake.variationId,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (existing) {
    await prisma.recipeIngredient.deleteMany({
      where: { recipeVersionId: existing.id },
    });
    await prisma.recipeVersion.update({
      where: { id: existing.id },
      data: { label: shake.label },
    });
    await prisma.recipeIngredient.createMany({
      data: shake.lines.map((line) => ({
        recipeVersionId: existing.id,
        inventoryItemId: line.inventoryItemId,
        qtyBase: line.qtyBase,
      })),
    });
    console.log(`Updated: ${shake.label} (${existing.id})`);
    return;
  }

  const recipe = await prisma.recipeVersion.create({
    data: {
      menuItemId: shake.menuItemId,
      variationId: shake.variationId,
      effectiveFrom: new Date(),
      label: shake.label,
      yieldQty: 1,
      yieldUnit: "",
      ingredients: {
        create: shake.lines.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          qtyBase: line.qtyBase,
        })),
      },
    },
  });
  console.log(`Created: ${shake.label} (${recipe.id})`);
}

async function main() {
  for (const shake of SHAKES) {
    await upsertShakeRecipe(shake);
  }
  const prisma = getPrisma();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
