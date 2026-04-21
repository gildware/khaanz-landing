import type {
  CartAddonWithQty,
  CartComboLine,
  CartItemLine,
  CartLine,
  CartOpenLine,
  MenuVariation,
} from "@/types/menu";

export function buildLineId(
  itemId: string,
  variation: MenuVariation,
  addons: CartAddonWithQty[],
): string {
  const addonKey = [...addons]
    .filter((a) => a.quantity > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => `${a.id}:${a.quantity}`)
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
  if (l.kind === "open") return l as CartOpenLine;
  if (l.kind === "item") {
    const it = l as CartItemLine;
    const addons = (it.addons as CartItemLine["addons"]).map((a) =>
      typeof a.quantity === "number" && Number.isFinite(a.quantity) && a.quantity >= 0
        ? a
        : { ...a, quantity: 1 },
    );
    return { ...it, kind: "item" as const, addons };
  }
  const raw = line as unknown as Record<string, unknown>;
  if (typeof raw.comboId === "string") {
    return { ...line, kind: "combo" } as CartComboLine;
  }
  const lraw = line as unknown as Record<string, unknown>;
  if (lraw.addons && Array.isArray(lraw.addons)) {
    const normalized = (lraw.addons as Record<string, unknown>[]).map((a) => ({
      ...a,
      quantity:
        typeof a.quantity === "number" &&
        Number.isFinite(a.quantity) &&
        a.quantity >= 0
          ? Math.floor(a.quantity)
          : 1,
    }));
    return {
      ...line,
      kind: "item" as const,
      addons: normalized,
    } as CartItemLine;
  }
  return { ...line, kind: "item" } as CartItemLine;
}

export function computeUnitPrice(
  variation: MenuVariation,
  addons: CartAddonWithQty[],
): number {
  return (
    variation.price +
    addons
      .filter((a) => a.quantity > 0)
      .reduce((s, a) => s + a.price * a.quantity, 0)
  );
}
