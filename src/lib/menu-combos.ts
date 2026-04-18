import { isMenuItemAvailable } from "@/lib/menu-availability";
import type { MenuCombo, MenuItem } from "@/types/menu";

/** Virtual category id for the Combos tab (not stored in categories list) */
export const COMBOS_TAB_ID = "__combos";

function componentQty(c: { quantity?: number }): number {
  const q = c.quantity;
  if (typeof q === "number" && Number.isFinite(q) && q >= 1) {
    return Math.min(999, Math.floor(q));
  }
  return 1;
}

/** Ensures every component line has a valid quantity (for older saved menus). */
export function normalizeMenuCombos(combos: MenuCombo[]): MenuCombo[] {
  return combos.map((combo) => ({
    ...combo,
    components: combo.components.map((c) => ({
      ...c,
      quantity: componentQty(c),
    })),
  }));
}

/** Sum of (variation menu price × quantity) for each component line. */
export function computeComboRetailTotal(
  combo: MenuCombo,
  items: MenuItem[],
): number {
  let sum = 0;
  for (const c of combo.components) {
    const item = items.find((i) => i.id === c.itemId);
    const v = item?.variations.find((x) => x.id === c.variationId);
    if (!item || !v) continue;
    sum += v.price * componentQty(c);
  }
  return sum;
}

export function isComboAvailable(combo: MenuCombo, items: MenuItem[]): boolean {
  if (combo.available === false) return false;
  if (!combo.components.length) return false;
  for (const c of combo.components) {
    const item = items.find((i) => i.id === c.itemId);
    if (!item || !isMenuItemAvailable(item)) return false;
    if (!item.variations.some((v) => v.id === c.variationId)) return false;
  }
  return true;
}

export function formatComboComponentSummary(
  combo: MenuCombo,
  items: MenuItem[],
): string {
  const parts: string[] = [];
  for (const c of combo.components) {
    const item = items.find((i) => i.id === c.itemId);
    const v = item?.variations.find((x) => x.id === c.variationId);
    if (item && v) {
      const q = componentQty(c);
      parts.push(
        q > 1
          ? `${q}× ${item.name} (${v.name})`
          : `${item.name} (${v.name})`,
      );
    }
  }
  return parts.join(" + ");
}
