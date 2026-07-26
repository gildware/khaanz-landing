/**
 * Refresh Peri Peri Marinade — add 250 g maida for post-marination coating (1072 g batch).
 * Run: npx tsx scripts/update-peri-peri-marinade-recipe.ts
 */
import { getPrisma } from "../src/lib/prisma";

const MENU_ITEM_ID = "peri-peri-marinade";
const VARIATION_ID = "peri-peri-marinade";
const YIELD_BATCH_G = 1072;

const MAIDA_ID = "cmrnd2iym004rpm0ib3bxcrn5";

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
  { inventoryItemId: MAIDA_ID, qtyBase: 250, note: "Maida (coating)" },
];

async function main() {
  const prisma = getPrisma();

  const menuItem = await prisma.menuItem.findUnique({ where: { id: MENU_ITEM_ID } });
  if (!menuItem) {
    console.error(`Menu item "${MENU_ITEM_ID}" not found.`);
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

  const existing = await prisma.recipeVersion.findFirst({
    where: { menuItemId: MENU_ITEM_ID, variationId: VARIATION_ID },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!existing) {
    console.error("Peri Peri Marinade recipe not found — run add-peri-peri-marinade-recipe.ts first.");
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeVersionId: existing.id } });
    await tx.recipeVersion.update({
      where: { id: existing.id },
      data: {
        label: "Peri Peri Marinade — full batch (with maida coating)",
        yieldQty: YIELD_BATCH_G,
        yieldUnit: "g",
      },
    });
    await tx.recipeIngredient.createMany({
      data: RECIPE_LINES.map((line) => ({
        recipeVersionId: existing.id,
        inventoryItemId: line.inventoryItemId,
        qtyBase: line.qtyBase,
      })),
    });
    await tx.menuItem.update({
      where: { id: MENU_ITEM_ID },
      data: {
        description:
          "Peri peri chicken marinade + maida coating — internal batch (1072 g) for strips, wings, popcorn, crispy, and burger prep.",
      },
    });
  });

  console.log(`Updated ${MENU_ITEM_ID}: yield ${YIELD_BATCH_G} g, ${RECIPE_LINES.length} ingredients`);
  for (const line of RECIPE_LINES) {
    const name = found.find((f) => f.id === line.inventoryItemId)?.name;
    console.log(`  ${name}: ${line.qtyBase} (${line.note})`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
