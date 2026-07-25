/**
 * Add Dum Chicken + Boiled Chicken prep items under Raw Items (no recipes yet).
 * Run: npx tsx scripts/add-raw-chicken-prep-items.ts
 */
import { getPrisma } from "../src/lib/prisma";

const CATEGORY_ID = "raw-items";

const ITEMS = [
  {
    id: "dum-chicken",
    name: "Dum Chicken",
    description: "Dum chicken prep — internal component (recipe to be added).",
    image: "/menu/dum-chicken-biryani.jpg",
    sortOrder: 9,
  },
  {
    id: "boiled-chicken",
    name: "Boiled Chicken",
    description: "Boiled chicken prep — internal component (recipe to be added).",
    image: "/menu/fried-chicken.jpg",
    sortOrder: 10,
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

  for (const item of ITEMS) {
    const existing = await prisma.menuItem.findUnique({ where: { id: item.id } });
    if (existing) {
      console.error(`Menu item "${item.id}" already exists — aborting.`);
      process.exit(1);
    }

    const created = await prisma.menuItem.create({
      data: {
        id: item.id,
        categoryId: CATEGORY_ID,
        name: item.name,
        description: item.description,
        image: item.image,
        isVeg: false,
        recommended: false,
        available: false,
        notForSale: true,
        sortOrder: item.sortOrder,
        variations: {
          create: {
            id: item.id,
            name: "Batch",
            price: 0,
            sortOrder: 0,
          },
        },
      },
    });

    console.log("Created:", created.id, created.name);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
