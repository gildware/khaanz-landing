/**
 * Upload every menu/combo/category image to Cloudinary and store only URLs.
 *
 *   npx tsx scripts/migrate-images-to-cloudinary.ts
 */
import { loadEnvConfig } from "@next/env";
import path from "node:path";

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

const PLACEHOLDER_FILE = path.join(process.cwd(), "public/placeholder-food.svg");

function resolveSource(image: string): string | null {
  const t = image.trim();
  if (isCloudinaryUrl(t)) return null;
  if (isDataImageUrl(t)) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/") && !t.includes("placeholder-food")) return `${SITE}${t}`;
  return PLACEHOLDER_FILE;
}

async function uploadFromUrlOrFile(source: string, folder: string, publicId: string) {
  try {
    return await uploadMenuImageToCloudinary({ source, folder, publicId });
  } catch (e) {
    if (!/^https?:\/\//i.test(source)) throw e;
    const res = await fetch(source, {
      headers: { "User-Agent": "khaanz-cloudinary-migrate" },
    });
    if (!res.ok) throw e;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    return await uploadMenuImageToCloudinary({
      source: dataUri,
      folder,
      publicId,
    });
  }
}

async function uploadWithFallback(
  kind: string,
  id: string,
  name: string,
  image: string,
  folder: string,
): Promise<string | null> {
  const source = resolveSource(image);
  if (!source) return null;
  try {
    const url = await uploadFromUrlOrFile(source, folder, id);
    console.log(`  ${kind} ${id} (${name}) -> ${url}`);
    return url;
  } catch (e) {
    if (source === PLACEHOLDER_FILE) throw e;
    const url = await uploadMenuImageToCloudinary({
      source: PLACEHOLDER_FILE,
      folder,
      publicId: id,
    });
    console.warn(
      `  ${kind} ${id} (${name}) missing file, used placeholder -> ${url}`,
    );
    return url;
  }
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
      const url = await uploadWithFallback(
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
      failed += 1;
      console.error(`  FAIL item ${row.id}:`, e instanceof Error ? e.message : e);
    }
  }

  const combos = await prisma.menuCombo.findMany({
    select: { id: true, name: true, image: true },
  });
  for (const row of combos) {
    try {
      const url = await uploadWithFallback(
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
      const url = await uploadWithFallback(
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
