import type {
  CartComboLine,
  CartItemLine,
  CartLine,
  MenuAddon,
  MenuVariation,
} from "@/types/menu";

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

export function buildComboLineId(comboId: string): string {
  return `combo::${comboId}`;
}

/** Ensures persisted cart lines from before combo support still validate. */
export function migrateCartLine(line: CartLine): CartLine {
  const l = line as CartLine & { kind?: string };
  if (l.kind === "combo") return l as CartComboLine;
  if (l.kind === "item") return l as CartItemLine;
  const raw = line as unknown as Record<string, unknown>;
  if (typeof raw.comboId === "string") {
    return { ...line, kind: "combo" } as CartComboLine;
  }
  return { ...line, kind: "item" } as CartItemLine;
}

export function computeUnitPrice(
  variation: MenuVariation,
  addons: MenuAddon[],
): number {
  return variation.price + addons.reduce((s, a) => s + a.price, 0);
}
