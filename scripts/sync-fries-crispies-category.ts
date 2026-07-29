/**
 * One-time sync: rename Fries & More → Fries & Crispies, merge Crispy Bites
 * items, and align DB with bundled defaults in src/data/menu.ts.
 *
 * Usage: npx tsx scripts/sync-fries-crispies-category.ts
 */
import { getDefaultMenuPayload } from "../src/data/menu";
import { getPrisma } from "../src/lib/prisma";
import { writeMenuPayload } from "../src/lib/menu-repository";

async function main() {
  const prisma = getPrisma();

  const before = await prisma.category.findMany({
    where: {
      OR: [
        { name: { contains: "Fries", mode: "insensitive" } },
        { name: { contains: "Crisp", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true } },
    },
  });
  console.log("Before:", before);

  await writeMenuPayload(getDefaultMenuPayload());

  const orphaned = await prisma.category.findMany({
    where: {
      name: { in: ["Fries & More", "Crispy Bites"] },
      items: { none: {} },
    },
    select: { id: true, name: true },
  });

  if (orphaned.length > 0) {
    await prisma.category.deleteMany({
      where: { id: { in: orphaned.map((c) => c.id) } },
    });
    console.log("Removed orphaned categories:", orphaned);
  }

  const after = await prisma.category.findMany({
    where: {
      OR: [
        { name: { contains: "Fries", mode: "insensitive" } },
        { name: { contains: "Crisp", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      _count: { select: { items: true } },
      items: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  console.log("After:", JSON.stringify(after, null, 2));
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    try {
      await getPrisma().$disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
