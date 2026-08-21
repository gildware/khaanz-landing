/** Static placeholder when a menu item has no image or loading fails. */
export const MENU_ITEM_PLACEHOLDER_IMAGE = "/placeholder-food.svg";

/**
 * Stock Unsplash URLs were routed through `/_next/image` and often 404ed (bad IDs,
 * or the optimizer could not fetch upstream). Use the local placeholder instead so
 * the browser never requests remote URLs for menu thumbnails.
 */
function isUnsplashMenuImage(src: string): boolean {
  try {
    const u = new URL(src);
    return u.hostname === "images.unsplash.com";
  } catch {
    return false;
  }
}

export function resolveMenuItemImage(src: string | null | undefined): string {
  const t = typeof src === "string" ? src.trim() : "";
  if (!t) return MENU_ITEM_PLACEHOLDER_IMAGE;
  if (isUnsplashMenuImage(t)) return MENU_ITEM_PLACEHOLDER_IMAGE;
  if (t.includes("res.cloudinary.com") && t.includes("/image/upload/")) {
    if (!t.includes("/upload/f_auto") && !/\/upload\/(?:[^/]+,)+/.test(t)) {
      return t.replace(
        "/image/upload/",
        "/image/upload/f_auto,q_auto,c_limit,w_800/",
      );
    }
  }
  return t;
}
