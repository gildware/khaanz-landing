import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuItem } from "@/types/menu";

/** Matches admin UI: ON when omitted or true; OFF only when explicitly false. */
export function isMenuItemAvailable(item: MenuItem): boolean {
  return item.available !== false;
}

/** Category is shown on the storefront unless explicitly hidden. */
export function isMenuCategoryAvailable(
  cat: MenuCategoryDef | undefined,
): boolean {
  return cat?.available !== false;
}

/** True when the item or its category is marked not for sale. */
export function isMenuItemNotForSale(
  item: MenuItem,
  categories?: MenuCategoryDef[],
): boolean {
  if (item.notForSale === true) return true;
  if (categories) {
    const cat = categories.find((c) => c.name === item.category);
    if (cat?.notForSale === true) return true;
  }
  return false;
}

/** Customer/POS orderability: available and for sale. */
export function isMenuItemOrderable(
  item: MenuItem,
  categories?: MenuCategoryDef[],
): boolean {
  return isMenuItemAvailable(item) && !isMenuItemNotForSale(item, categories);
}

/**
 * Storefront listing: orderable and not in a category hidden from the website.
 * POS should keep using {@link isMenuItemOrderable} so hidden categories stay
 * sellable in-house.
 */
export function isMenuItemVisibleOnStorefront(
  item: MenuItem,
  categories?: MenuCategoryDef[],
): boolean {
  if (!isMenuItemOrderable(item, categories)) return false;
  if (!categories?.length) return true;
  const cat = categories.find((c) => c.name === item.category);
  if (!cat) return true;
  return isMenuCategoryAvailable(cat);
}
