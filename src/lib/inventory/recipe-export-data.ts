import { formatRecipeQtyBase } from "@/lib/inventory/decimal-utils";
import type {
  RecipeExportBook,
  RecipeExportCategory,
  RecipeExportIngredient,
  RecipeExportSheet,
} from "@/lib/inventory/recipe-export-types";
import { getPrisma } from "@/lib/prisma";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatEffectiveDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(0, 10);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return iso.slice(0, 10);
  }
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function formatExportDateLabel(at: Date): string {
  return `${at.getDate()} ${MONTH_NAMES[at.getMonth()]} ${at.getFullYear()}`;
}

function formatYieldQty(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Number.isInteger(n)) return n.toLocaleString("en-IN");
  return value;
}

type RecipeRow = Awaited<
  ReturnType<typeof fetchRecipeRows>
>[number];

async function fetchRecipeRows() {
  const prisma = getPrisma();
  return prisma.recipeVersion.findMany({
    orderBy: [{ menuItemId: "asc" }, { effectiveFrom: "desc" }],
    include: {
      ingredients: {
        include: {
          item: { select: { name: true, baseUnit: true } },
          componentMenuItem: { select: { id: true, name: true } },
        },
      },
      menuItem: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
          category: { select: { id: true, name: true, sortOrder: true } },
          variations: { select: { id: true, name: true, sortOrder: true } },
        },
      },
    },
  });
}

/** Latest version per menu item + variation (newest effectiveFrom wins). */
function pickLatestRecipes(rows: RecipeRow[]): RecipeRow[] {
  const byKey = new Map<string, RecipeRow>();
  for (const row of rows) {
    const key = `${row.menuItemId}\0${row.variationId ?? ""}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      row.effectiveFrom.getTime() > existing.effectiveFrom.getTime() ||
      (row.effectiveFrom.getTime() === existing.effectiveFrom.getTime() &&
        row.createdAt.getTime() > existing.createdAt.getTime())
    ) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function versionNumberById(rows: RecipeRow[]): Map<string, number> {
  const versionById = new Map<string, number>();
  const byKey = new Map<string, RecipeRow[]>();
  for (const row of rows) {
    const key = `${row.menuItemId}\0${row.variationId ?? ""}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => {
      const t = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
      if (t !== 0) return t;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    list.forEach((row, index) => versionById.set(row.id, index + 1));
  }
  return versionById;
}

function variationName(
  menuItem: RecipeRow["menuItem"],
  variationId: string | null,
): string {
  if (!variationId) {
    if (menuItem.variations.length === 1) {
      return menuItem.variations[0]!.name;
    }
    return "All variations";
  }
  return (
    menuItem.variations.find((v) => v.id === variationId)?.name ?? variationId
  );
}

function serializeIngredients(
  row: RecipeRow,
  componentYieldUnit: (menuItemId: string, variationId: string | null) => string,
): RecipeExportIngredient[] {
  return row.ingredients.map((ing) => {
    if (ing.componentMenuItemId) {
      return {
        kind: "prep" as const,
        name: ing.componentMenuItem?.name ?? "Prep item",
        qty: formatRecipeQtyBase(ing.qtyBase),
        unit:
          componentYieldUnit(
            ing.componentMenuItemId,
            ing.componentVariationId,
          ) || "g",
      };
    }
    return {
      kind: "stock" as const,
      name: ing.item?.name ?? "Stock item",
      qty: formatRecipeQtyBase(ing.qtyBase),
      unit: ing.item?.baseUnit?.trim() || "g",
    };
  });
}

function toSheet(
  row: RecipeRow,
  version: number,
  componentYieldUnit: (menuItemId: string, variationId: string | null) => string,
): RecipeExportSheet {
  const effectiveFrom = row.effectiveFrom.toISOString();
  const label =
    row.label.trim() ||
    `${row.menuItem.name}${row.variationId ? ` — ${variationName(row.menuItem, row.variationId)}` : ""}`;

  return {
    id: row.id,
    menuItemId: row.menuItemId,
    menuItemName: row.menuItem.name,
    categoryId: row.menuItem.category.id,
    categoryName: row.menuItem.category.name,
    variationId: row.variationId,
    variationName: variationName(row.menuItem, row.variationId),
    version,
    effectiveFrom,
    effectiveFromLabel: formatEffectiveDateLabel(effectiveFrom),
    label,
    yieldQty: formatYieldQty(row.yieldQty.toString()),
    yieldUnit: row.yieldUnit?.trim() || "portion",
    ingredients: serializeIngredients(row, componentYieldUnit),
  };
}

export async function loadRecipeExportBook(): Promise<RecipeExportBook> {
  const allRows = await fetchRecipeRows();
  const versionById = versionNumberById(allRows);
  const latest = pickLatestRecipes(allRows);
  const latestByKey = new Map<string, RecipeRow>();
  for (const row of latest) {
    latestByKey.set(`${row.menuItemId}\0${row.variationId ?? ""}`, row);
  }
  const componentYieldUnit = (menuItemId: string, variationId: string | null) => {
    const specific = latestByKey.get(`${menuItemId}\0${variationId ?? ""}`);
    if (specific?.yieldUnit?.trim()) return specific.yieldUnit.trim();
    const fallback = latestByKey.get(`${menuItemId}\0`);
    return fallback?.yieldUnit?.trim() || "g";
  };

  const sheets = latest
    .map((row) => toSheet(row, versionById.get(row.id) ?? 1, componentYieldUnit))
    .sort(
      (a, b) =>
        a.categoryName.localeCompare(b.categoryName) ||
        a.menuItemName.localeCompare(b.menuItemName) ||
        a.variationName.localeCompare(b.variationName),
    );

  const categoryMap = new Map<string, RecipeExportCategory>();
  for (const sheet of sheets) {
    const row = latest.find((r) => r.id === sheet.id)!;
    const cat = row.menuItem.category;
    let bucket = categoryMap.get(cat.id);
    if (!bucket) {
      bucket = {
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        recipes: [],
      };
      categoryMap.set(cat.id, bucket);
    }
    bucket.recipes.push(sheet);
  }

  const categories = [...categoryMap.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  const exportedAt = new Date();
  return {
    exportedAt: exportedAt.toISOString(),
    exportedAtLabel: formatExportDateLabel(exportedAt),
    categories,
    totalRecipes: sheets.length,
  };
}