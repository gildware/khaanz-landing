export type RecipeExportIngredient = {
  kind: "stock" | "prep";
  name: string;
  qty: string;
  unit: string;
};

export type RecipeExportSheet = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  categoryId: string;
  categoryName: string;
  variationId: string | null;
  variationName: string;
  version: number;
  effectiveFrom: string;
  effectiveFromLabel: string;
  label: string;
  yieldQty: string;
  yieldUnit: string;
  ingredients: RecipeExportIngredient[];
};

export type RecipeExportCategory = {
  id: string;
  name: string;
  sortOrder: number;
  recipes: RecipeExportSheet[];
};

export type RecipeExportBook = {
  exportedAt: string;
  exportedAtLabel: string;
  categories: RecipeExportCategory[];
  totalRecipes: number;
};

export function recipesForCategory(
  book: RecipeExportBook,
  categoryId: string,
): RecipeExportSheet[] {
  if (categoryId === "all") {
    return book.categories.flatMap((c) => c.recipes);
  }
  return book.categories.find((c) => c.id === categoryId)?.recipes ?? [];
}
