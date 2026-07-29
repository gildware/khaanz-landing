/**
 * Import all recipes from the Jul 26 2026 PDF export into the live DB.
 *
 * Source: scripts/data/pdf-recipes-2026-07-26.json
 * Run:    npx tsx scripts/import-pdf-recipes.ts
 * Dry run: npx tsx scripts/import-pdf-recipes.ts --dry-run
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

import { getPrisma } from "../src/lib/prisma";

type PdfIngredient = {
  kind: "stock" | "prep";
  name: string;
  qty: number;
  unit: string;
};

type PdfRecipe = {
  category: string;
  dish: string;
  title: string;
  variation: string;
  effectiveFrom: string | null;
  yieldQty: number;
  yieldUnit: string;
  ingredients: PdfIngredient[];
};

/** PDF stock name → DB inventory name aliases */
const INV_ALIASES: Record<string, string> = {
  "dev @ 20": "Dew @ 20",
  "peri peri masla": "Peri Peri Masla",
  "water melon mojito": "Water Melon Mojito",
  "black current crush": "Black Current Crush",
  "black current gallon": "Black Current Gallon",
  "garlic powder": "Garlic powder",
  "chili flakes sachet": "Chili flakes Sachet",
  "chili ﬂakes sachet": "Chili flakes Sachet", // PDF may use special ﬁ ligature
  "full live chicken": "Full Live chicken",
  "coffee sachet": "Coffee Sachet",
  "ice cubes": "Ice Cubes",
  "aromatic mix": "Aromatic Mix",
  "food colour": "Food Colour",
  "kalonji": "Kalonji",
};

function defaultUnits(pdfUnit: string): {
  baseUnit: string;
  purchaseUnit: string;
  baseUnitsPerPurchaseUnit: number;
  category: string;
} {
  const u = pdfUnit.toLowerCase();
  if (u === "kg" || u === "g") {
    return {
      baseUnit: "g",
      purchaseUnit: "kg",
      baseUnitsPerPurchaseUnit: 1000,
      category: "Miscellaneous",
    };
  }
  if (u === "l" || u === "lt" || u === "ml") {
    return {
      baseUnit: "ml",
      purchaseUnit: "L",
      baseUnitsPerPurchaseUnit: 1000,
      category: "Miscellaneous",
    };
  }
  return {
    baseUnit: "pc",
    purchaseUnit: "pc",
    baseUnitsPerPurchaseUnit: 1,
    category: "Miscellaneous",
  };
}

/** PDF dish name → DB menu item name aliases */
const DISH_ALIASES: Record<string, string> = {
  "veg. fried rice": "Veg. Fried Rice",
  "veg. chowmein": "Veg. Chowmein",
  "coca-cola": "Coca-Cola",
  "blackcurrent blast": "Blackcurrent Blast",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseEffectiveFrom(raw: string | null): Date {
  if (!raw) return new Date("2026-07-26T00:00:00+05:30");
  const m = /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i.exec(
    raw.trim(),
  );
  if (!m) return new Date("2026-07-26T00:00:00+05:30");
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[m[2]!.toLowerCase()];
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 4, 30, 0));
}

function convertQty(
  qty: number,
  pdfUnit: string,
  baseUnit: string,
): number {
  const u = pdfUnit.toLowerCase();
  const b = baseUnit.toLowerCase();
  if (u === b) return qty;
  if (u === "kg" && b === "g") return qty * 1000;
  if (u === "g" && b === "kg") return qty / 1000;
  if ((u === "l" || u === "lt" || u === "liter" || u === "litre") && b === "ml") {
    return qty * 1000;
  }
  if (u === "ml" && (b === "l" || b === "lt")) return qty / 1000;
  // Oil sometimes listed as g while base is ml (approx 1:1 for kitchen use)
  if (u === "g" && b === "ml") return qty;
  if (u === "ml" && b === "g") return qty;
  return qty;
}

function matchVariation(
  variations: { id: string; name: string }[],
  pdfVariation: string,
  title: string,
): string | null {
  const v = pdfVariation.trim();
  if (!v || /^all variations$/i.test(v)) {
    // Single-variation dishes: apply the recipe to that variation by default.
    if (variations.length === 1) return variations[0]!.id;
    return null;
  }

  const byExact = variations.find(
    (x) => norm(x.name) === norm(v) || norm(x.name) === norm(v.replace(/pcs?/i, "pcs")),
  );
  if (byExact) return byExact.id;

  // Title suffix after em-dash often matches variation label better
  const dash = title.split(/\s*[—\-]\s*/);
  const suffix = dash.length > 1 ? dash[dash.length - 1]!.trim() : "";
  if (suffix) {
    const bySuffix = variations.find(
      (x) =>
        norm(x.name) === norm(suffix) ||
        norm(x.name).includes(norm(suffix)) ||
        norm(suffix).includes(norm(x.name)),
    );
    if (bySuffix) return bySuffix.id;
  }

  // Fuzzy: variation name contained in PDF variation or vice versa
  const fuzzy = variations.find(
    (x) =>
      norm(x.name).includes(norm(v)) ||
      norm(v).includes(norm(x.name)),
  );
  if (fuzzy) return fuzzy.id;

  // Single variation item → use it
  if (variations.length === 1) return variations[0]!.id;

  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = getPrisma();

  const jsonPath = join(
    process.cwd(),
    "scripts/data/pdf-recipes-2026-07-26.json",
  );
  const recipes = JSON.parse(readFileSync(jsonPath, "utf8")) as PdfRecipe[];

  const [inventory, menuItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { active: true },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.menuItem.findMany({
      select: {
        id: true,
        name: true,
        variations: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  const invByNorm = new Map<string, (typeof inventory)[number]>();
  for (const it of inventory) {
    invByNorm.set(norm(it.name), it);
  }
  for (const [from, to] of Object.entries(INV_ALIASES)) {
    const hit = invByNorm.get(norm(to));
    if (hit) invByNorm.set(norm(from), hit);
  }

  const menuByNorm = new Map<string, (typeof menuItems)[number]>();
  for (const mi of menuItems) {
    menuByNorm.set(norm(mi.name), mi);
  }
  for (const [from, to] of Object.entries(DISH_ALIASES)) {
    const hit = menuByNorm.get(norm(to));
    if (hit) menuByNorm.set(norm(from), hit);
  }

  type ResolvedLine =
    | { kind: "inventory"; inventoryItemId: string; qtyBase: number; note: string }
    | {
        kind: "menu_item";
        componentMenuItemId: string;
        componentVariationId: string | null;
        qtyBase: number;
        note: string;
      };

  const errors: string[] = [];
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invCreated = 0;

  async function ensureInventory(
    name: string,
    pdfUnit: string,
  ): Promise<(typeof inventory)[number]> {
    const existing = invByNorm.get(norm(name));
    if (existing) return existing;

    const units = defaultUnits(pdfUnit);
    if (dryRun) {
      const fake = {
        id: `dry-${norm(name).replace(/\s+/g, "-")}`,
        name,
        baseUnit: units.baseUnit,
      };
      invByNorm.set(norm(name), fake);
      invCreated++;
      warnings.push(`WOULD CREATE STOCK: ${name} (${units.baseUnit})`);
      return fake;
    }

    const createdInv = await prisma.inventoryItem.create({
      data: {
        name,
        category: units.category,
        baseUnit: units.baseUnit,
        purchaseUnit: units.purchaseUnit,
        baseUnitsPerPurchaseUnit: new Prisma.Decimal(units.baseUnitsPerPurchaseUnit),
        stockOnHandBase: new Prisma.Decimal(0),
        avgCostPaisePerBase: new Prisma.Decimal(0),
        active: true,
      },
      select: { id: true, name: true, baseUnit: true },
    });
    invByNorm.set(norm(createdInv.name), createdInv);
    invCreated++;
    console.log(`created stock: ${createdInv.name}`);
    return createdInv;
  }

  // Import Raw Items first so prep components exist when sold dishes reference them
  const ordered = [...recipes].sort((a, b) => {
    const ar = a.category === "Raw Items" ? 0 : 1;
    const br = b.category === "Raw Items" ? 0 : 1;
    return ar - br;
  });

  for (const recipe of ordered) {
    const dishKey = norm(recipe.dish);
    const menu = menuByNorm.get(dishKey);
    if (!menu) {
      errors.push(`NO MENU ITEM: ${recipe.dish} (${recipe.title})`);
      skipped++;
      continue;
    }

    const variationId = matchVariation(
      menu.variations,
      recipe.variation,
      recipe.title,
    );
    if (
      recipe.variation &&
      !/^all variations$/i.test(recipe.variation) &&
      variationId === null &&
      menu.variations.length > 1
    ) {
      warnings.push(
        `VARIATION UNMATCHED (using item-level null): ${recipe.title} → variations=[${menu.variations.map((v) => v.name).join(", ")}]`,
      );
    }

    const lines: ResolvedLine[] = [];
    let lineFailed = false;
    for (const ing of recipe.ingredients) {
      if (ing.kind === "stock") {
        // Normalize unicode ligatures from PDF (ﬂ → fl)
        const stockName = ing.name.replace(/\uFB02/g, "fl").replace(/\uFB01/g, "fi");
        let inv = invByNorm.get(norm(stockName));
        if (!inv) {
          inv = await ensureInventory(stockName, ing.unit);
        }
        lines.push({
          kind: "inventory",
          inventoryItemId: inv.id,
          qtyBase: convertQty(ing.qty, ing.unit, inv.baseUnit),
          note: stockName,
        });
      } else {
        const prep = menuByNorm.get(norm(ing.name));
        if (!prep) {
          errors.push(`NO PREP: "${ing.name}" in ${recipe.title}`);
          lineFailed = true;
          continue;
        }
        // Prefer matching component variation when only one, else null (default recipe)
        const componentVariationId =
          prep.variations.length === 1 ? prep.variations[0]!.id : null;
        // Nested qty stays in the PDF unit (matches component yield unit from PDF)
        lines.push({
          kind: "menu_item",
          componentMenuItemId: prep.id,
          componentVariationId,
          qtyBase: ing.qty,
          note: ing.name,
        });
      }
    }
    if (lineFailed || lines.length === 0) {
      skipped++;
      continue;
    }

    const label = recipe.title.slice(0, 120);
    const effectiveFrom = parseEffectiveFrom(recipe.effectiveFrom);
    // Fix obvious PDF typo: Momos Dough yield listed as thousands of kg
    const yieldQty = recipe.yieldQty;
    let yieldUnit = recipe.yieldUnit;
    if (
      recipe.dish === "Momos Dough" &&
      yieldUnit.toLowerCase() === "kg" &&
      yieldQty > 100
    ) {
      yieldUnit = "g";
    }

    if (dryRun) {
      console.log(
        `[dry] ${menu.name} / ${variationId ?? "(all)"} ← ${lines.length} lines · yield ${yieldQty} ${yieldUnit}`,
      );
      created++;
      continue;
    }

    const existing = await prisma.recipeVersion.findFirst({
      where: {
        menuItemId: menu.id,
        variationId: variationId,
      },
      orderBy: { effectiveFrom: "desc" },
    });

    await prisma.$transaction(
      async (tx) => {
        if (existing) {
          await tx.recipeIngredient.deleteMany({
            where: { recipeVersionId: existing.id },
          });
          await tx.recipeVersion.update({
            where: { id: existing.id },
            data: {
              label,
              effectiveFrom,
              yieldQty: new Prisma.Decimal(yieldQty),
              yieldUnit: yieldUnit.slice(0, 32),
              ingredients: {
                create: lines.map((l) =>
                  l.kind === "inventory"
                    ? {
                        inventoryItemId: l.inventoryItemId,
                        qtyBase: new Prisma.Decimal(l.qtyBase),
                      }
                    : {
                        componentMenuItemId: l.componentMenuItemId,
                        componentVariationId: l.componentVariationId,
                        qtyBase: new Prisma.Decimal(l.qtyBase),
                      },
                ),
              },
            },
          });
          updated++;
        } else {
          await tx.recipeVersion.create({
            data: {
              menuItemId: menu.id,
              variationId,
              label,
              effectiveFrom,
              yieldQty: new Prisma.Decimal(yieldQty),
              yieldUnit: yieldUnit.slice(0, 32),
              ingredients: {
                create: lines.map((l) =>
                  l.kind === "inventory"
                    ? {
                        inventoryItemId: l.inventoryItemId,
                        qtyBase: new Prisma.Decimal(l.qtyBase),
                      }
                    : {
                        componentMenuItemId: l.componentMenuItemId,
                        componentVariationId: l.componentVariationId,
                        qtyBase: new Prisma.Decimal(l.qtyBase),
                      },
                ),
              },
            },
          });
          created++;
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    console.log(
      `${existing ? "updated" : "created"}: ${recipe.title} (${menu.id}${variationId ? ` / ${variationId}` : ""})`,
    );
  }

  console.log("\n=== Summary ===");
  console.log(`PDF recipes: ${recipes.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Stock items created: ${invCreated}`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 40)) console.log("  " + w);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    // unique
    const uniq = [...new Set(errors)];
    for (const e of uniq.slice(0, 80)) console.log("  " + e);
    if (uniq.length > 80) console.log(`  … +${uniq.length - 80} more`);
  }

  const counts = await prisma.$queryRaw<{ t: string; c: bigint }[]>`
    SELECT 'recipe_versions' AS t, COUNT(*)::bigint AS c FROM recipe_versions
    UNION ALL SELECT 'recipe_ingredients', COUNT(*)::bigint FROM recipe_ingredients
  `;
  console.log("\nDB now:", Object.fromEntries(counts.map((r) => [r.t, Number(r.c)])));

  await prisma.$disconnect();
  if (errors.length && !dryRun && created + updated === 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await getPrisma().$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
