/**
 * Upload every menu/combo/category image to Cloudinary and store only URLs.
 *
 *   npx tsx scripts/migrate-images-to-cloudinary.ts
 */
import { loadEnvConfig } from "@next/env";

import {
  isCloudinaryConfigured,
  isCloudinaryUrl,
  isDataImageUrl,
  uploadMenuImageToCloudinary,
} from "../src/lib/cloudinary";
import {
  CLOUDINARY_FOLDER_CATEGORIES,
  CLOUDINARY_FOLDER_COMBOS,
  CLOUDINARY_FOLDER_ITEMS,
} from "../src/lib/cloudinary-folders";
import { getPrisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://khaanz.in"
).replace(/\/$/, "");

function resolveSource(image: string): string | null {
  const t = image.trim();
  if (t === "/placeholder-food.svg" || t.endsWith("placeholder-food.svg")) {
    return null;
  }
  if (t.includes("images.unsplash.com")) return null;
  if (isCloudinaryUrl(t)) return null;
  if (isDataImageUrl(t)) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `${SITE}${t}`;
  return t;
}

async function migrateOne(
  kind: string,
  id: string,
  name: string,
  image: string,
  folder: string,
): Promise<string | null> {
  const source = resolveSource(image);
  if (!source) return null;
  const url = await uploadMenuImageToCloudinary({
    source,
    folder,
    publicId: id,
  });
  console.log(`  ${kind} ${id} (${name}) -> ${url}`);
  return url;
}

function isMissingRemote(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("Resource not found") || msg.includes("404");
}

async function main() {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
    );
  }
  const prisma = getPrisma();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const items = await prisma.menuItem.findMany({
    select: { id: true, name: true, image: true },
  });
  for (const row of items) {
    try {
      const url = await migrateOne(
        "item",
        row.id,
        row.name,
        row.image,
        CLOUDINARY_FOLDER_ITEMS,
      );
      if (!url) {
        skipped += 1;
        continue;
      }
      await prisma.menuItem.update({
        where: { id: row.id },
        data: { image: url },
      });
      updated += 1;
    } catch (e) {
      if (isMissingRemote(e)) {
        skipped += 1;
        console.warn(`  SKIP missing file item ${row.id}`);
        continue;
      }
      failed += 1;
      console.error(`  FAIL item ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  const combos = await prisma.menuCombo.findMany({
    select: { id: true, name: true, image: true },
  });
  for (const row of combos) {
    try {
      const url = await migrateOne(
        "combo",
        row.id,
        row.name,
        row.image,
        CLOUDINARY_FOLDER_COMBOS,
      );
      if (!url) {
        skipped += 1;
        continue;
      }
      await prisma.menuCombo.update({
        where: { id: row.id },
        data: { image: url },
      });
      updated += 1;
    } catch (e) {
      if (isMissingRemote(e)) {
        skipped += 1;
        console.warn(`  SKIP missing file combo ${row.id}`);
        continue;
      }
      failed += 1;
      console.error(`  FAIL combo ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  const cats = await prisma.category.findMany({
    where: { parentId: null },
    select: { id: true, name: true, image: true },
  });
  for (const row of cats) {
    try {
      const url = await migrateOne(
        "category",
        row.id,
        row.name,
        row.image,
        CLOUDINARY_FOLDER_CATEGORIES,
      );
      if (!url) {
        skipped += 1;
        continue;
      }
      await prisma.category.update({
        where: { id: row.id },
        data: { image: url },
      });
      updated += 1;
    } catch (e) {
      if (isMissingRemote(e)) {
        skipped += 1;
        console.warn(`  SKIP missing file category ${row.id}`);
        continue;
      }
      failed += 1;
      console.error(`  FAIL category ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`Done. updated=${updated} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
