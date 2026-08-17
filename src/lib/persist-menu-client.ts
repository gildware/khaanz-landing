import type { MenuPayload } from "@/types/menu-payload";
import type { MenuAddon, MenuCombo, MenuItem } from "@/types/menu";
import type { MenuCategoryDef } from "@/types/menu-category";

async function putJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "Save failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "Delete failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/** Full catalogue sync — prefer targeted helpers below when editing one section. */
export async function persistMenuPayload(payload: MenuPayload): Promise<void> {
  await putJson("/api/admin/menu", payload);
}

/** Upsert one menu item without rewriting the whole catalogue. */
export async function persistMenuItem(item: MenuItem): Promise<void> {
  await putJson("/api/admin/menu/item", item);
}

/** Delete one menu item. */
export async function deleteMenuItemClient(itemId: string): Promise<void> {
  await deleteJson(
    `/api/admin/menu/item?id=${encodeURIComponent(itemId)}`,
  );
}

/** Upsert global add-ons and remove rows absent from the payload. */
export async function persistGlobalAddons(addons: MenuAddon[]): Promise<void> {
  await putJson("/api/admin/menu/global-addons", addons);
}

/** Upsert categories without rewriting menu items. */
export async function persistMenuCategories(
  categories: MenuCategoryDef[],
  options?: { markNotForSaleCategory?: string },
): Promise<void> {
  await putJson("/api/admin/menu/categories", {
    categories,
    ...(options?.markNotForSaleCategory
      ? { markNotForSaleCategory: options.markNotForSaleCategory }
      : {}),
  });
}

/** Upsert one combo without rewriting the whole catalogue. */
export async function persistMenuCombo(combo: MenuCombo): Promise<void> {
  await putJson("/api/admin/menu/combo", combo);
}

/** Delete one combo. */
export async function deleteMenuComboClient(comboId: string): Promise<void> {
  await deleteJson(
    `/api/admin/menu/combo?id=${encodeURIComponent(comboId)}`,
  );
}

/**
 * Reorder categories/items, toggle category/item visibility, and set
 * recommended items/combos without rewriting the whole menu (safe when
 * items are referenced by wastage, recipes, etc.).
 */
export async function persistMenuLayout(layout: {
  categories: { name: string; available: boolean }[];
  items: {
    id: string;
    available: boolean;
    recommended: boolean;
    recommendedSortOrder?: number;
  }[];
  combos: {
    id: string;
    recommended: boolean;
    recommendedSortOrder?: number;
  }[];
}): Promise<void> {
  await putJson("/api/admin/menu/layout", layout);
}

async function patchJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "Save failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/** Update availability / for-sale flags on one menu item. */
export async function persistMenuItemFlags(
  itemId: string,
  flags: { available?: boolean; notForSale?: boolean },
): Promise<void> {
  await patchJson("/api/admin/menu/item-flags", { id: itemId, ...flags });
}
