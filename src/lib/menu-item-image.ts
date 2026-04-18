/** Static placeholder when a menu item has no image or loading fails. */
export const MENU_ITEM_PLACEHOLDER_IMAGE = "/placeholder-food.svg";

export function resolveMenuItemImage(src: string | null | undefined): string {
  const t = typeof src === "string" ? src.trim() : "";
  if (!t) return MENU_ITEM_PLACEHOLDER_IMAGE;
  return t;
}
