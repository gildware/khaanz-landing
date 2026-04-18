import type { MenuAddon, MenuVariation } from "@/types/menu";

export function buildLineId(
  itemId: string,
  variation: MenuVariation,
  addons: MenuAddon[],
): string {
  const addonKey = [...addons]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => a.id)
    .join(",");
  return `${itemId}::${variation.id}::${addonKey}`;
}

export function computeUnitPrice(
  variation: MenuVariation,
  addons: MenuAddon[],
): number {
  return variation.price + addons.reduce((s, a) => s + a.price, 0);
}
