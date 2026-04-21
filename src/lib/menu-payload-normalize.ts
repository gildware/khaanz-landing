import type { MenuPayload } from "@/types/menu-payload";
import type { MenuCategoryDef } from "@/types/menu-category";

export function parseCategoryEntry(x: unknown): MenuCategoryDef | null {
  if (typeof x === "string") {
    const name = x.trim();
    if (!name) return null;
    return { name, image: "", icon: "utensils-crossed" };
  }
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  return {
    name,
    image: typeof o.image === "string" ? o.image : "",
    icon:
      typeof o.icon === "string" && o.icon.trim() !== ""
        ? o.icon.trim()
        : "utensils-crossed",
  };
}

/** Accepts legacy `string[]` or `{ name, image?, icon? }[]` from API JSON. */
export function normalizeMenuCategories(raw: unknown): MenuCategoryDef[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuCategoryDef[] = [];
  for (const el of raw) {
    const row = parseCategoryEntry(el);
    if (row) out.push(row);
  }
  return out;
}

export function normalizeMenuPayloadFromApi(body: unknown): MenuPayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (
    !Array.isArray(o.globalAddons) ||
    !Array.isArray(o.items) ||
    !Array.isArray(o.combos)
  ) {
    return null;
  }
  const categories = normalizeMenuCategories(o.categories);
  return {
    categories,
    globalAddons: o.globalAddons as MenuPayload["globalAddons"],
    items: o.items as MenuPayload["items"],
    combos: o.combos as MenuPayload["combos"],
  };
}
