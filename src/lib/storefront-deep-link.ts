import { slugifyCategoryName } from "@/lib/category-slug";
import { isMenuCategoryAvailable, isMenuItemVisibleOnStorefront } from "@/lib/menu-availability";
import { COMBOS_TAB_ID, isComboAvailable } from "@/lib/menu-combos";
import type { MenuCategoryDef } from "@/types/menu-category";
import type { MenuCombo, MenuItem } from "@/types/menu";

export type DeepLinkCategory = string | typeof COMBOS_TAB_ID;

export type ResolvedStorefrontDeepLink = {
  item: MenuItem | null;
  category: DeepLinkCategory | null;
};

/** Short / campaign names → canonical menu item ids. */
const ITEM_ALIASES: Record<string, string> = {
  momo: "steamed-chicken-momo",
  momos: "steamed-chicken-momo",
  "steamed-momo": "steamed-chicken-momo",
  "steamed-momos": "steamed-chicken-momo",
  zinger: "khaanz-zinger-burger",
  "zinger-burger": "khaanz-zinger-burger",
  shawarma: "item-mserom13",
  "chicken-shawarma": "item-mserom13",
  kadia: "kadai-chicken",
  "kadia-chicken": "kadai-chicken",
  popcorn: "khaanz-popcorn",
  "popcorn-chicken": "khaanz-popcorn",
  wings: "khaanz-wings",
  "crispy-wings": "khaanz-wings",
  strips: "khaanz-strips",
  "chicken-strips": "khaanz-strips",
};

/** Short / campaign names → slug of a real category name. */
const CATEGORY_ALIASES: Record<string, string> = {
  momo: "momo-mania",
  momos: "momo-mania",
  pizza: "pizza-zone",
  pizzas: "pizza-zone",
  shakes: "shakes",
  "thick-shakes": "shakes",
  mojito: "mojitos",
  mojitos: "mojitos",
  paratha: "parathas-rolls",
  parathas: "parathas-rolls",
  burgers: "burgers",
  burger: "burgers",
  "fried-chicken": "signature-chicken",
  "signature-chicken": "signature-chicken",
  "indo-chinese": "spicy-chinese",
  "spicy-chinese": "spicy-chinese",
  noodles: "noodle-hub",
  "chef-specials": "chef-specials",
  shawarma: "shawarma",
};

export function normalizeDeepLinkKey(raw: string): string {
  return slugifyCategoryName(raw.replace(/^\/+|\/+$/g, ""));
}

function findItemByKey(key: string, items: MenuItem[]): MenuItem | undefined {
  const aliasedId = ITEM_ALIASES[key];
  const targetId = aliasedId ?? key;
  const byId = items.find(
    (i) => i.id === targetId || normalizeDeepLinkKey(i.id) === targetId,
  );
  if (byId) return byId;
  return items.find((i) => normalizeDeepLinkKey(i.name) === key);
}

function findCategoryName(
  key: string,
  categories: MenuCategoryDef[],
): string | undefined {
  const aliased = CATEGORY_ALIASES[key] ?? key;
  const match = categories.find((c) => {
    const slug = normalizeDeepLinkKey(c.name);
    return slug === aliased || slug === key;
  });
  return match?.name;
}

export function resolveStorefrontDeepLink(input: {
  itemParam: string | null | undefined;
  categoryParam: string | null | undefined;
  items: MenuItem[];
  categories: MenuCategoryDef[];
  combos: MenuCombo[];
}): ResolvedStorefrontDeepLink {
  const itemKey = input.itemParam?.trim()
    ? normalizeDeepLinkKey(input.itemParam.trim())
    : "";
  const categoryKey = input.categoryParam?.trim()
    ? normalizeDeepLinkKey(input.categoryParam.trim())
    : "";

  if (itemKey) {
    const found = findItemByKey(itemKey, input.items);
    if (found && isMenuItemVisibleOnStorefront(found, input.categories)) {
      return { item: found, category: found.category };
    }
    if (found) {
      const cat = input.categories.find((c) => c.name === found.category);
      if (cat && isMenuCategoryAvailable(cat)) {
        return { item: null, category: found.category };
      }
    }
  }

  if (categoryKey) {
    if (categoryKey === "combos" || categoryKey === "combo") {
      const hasCombos = input.combos.some((c) =>
        isComboAvailable(c, input.items, input.categories),
      );
      return { item: null, category: hasCombos ? COMBOS_TAB_ID : null };
    }
    const name = findCategoryName(categoryKey, input.categories);
    if (name) {
      const cat = input.categories.find((c) => c.name === name);
      if (cat && isMenuCategoryAvailable(cat)) {
        return { item: null, category: name };
      }
    }
  }

  return { item: null, category: null };
}
