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

function normalizeOpenLine(raw: Record<string, unknown>): CartOpenLine {
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Open item";
  const quantity =
    typeof raw.quantity === "number" &&
    Number.isFinite(raw.quantity) &&
    raw.quantity >= 1
      ? Math.floor(raw.quantity)
      : 1;
  const unitPrice =
    typeof raw.unitPrice === "number" &&
    Number.isFinite(raw.unitPrice) &&
    raw.unitPrice >= 0
      ? raw.unitPrice
      : 0;
  return {
    kind: "open",
    lineId:
      typeof raw.lineId === "string" && raw.lineId.trim()
        ? raw.lineId
        : `open::${name.toLowerCase()}`,
    name,
    quantity,
    unitPrice,
  };
}

/** Ensures persisted cart lines from before combo support still validate. */
export function migrateCartLine(line: CartLine): CartLine {
  const l = line as CartLine & { kind?: string; type?: string };
  const raw = line as unknown as Record<string, unknown>;
  if (l.type === "open" && l.kind !== "open") {
    return normalizeOpenLine(raw);
  }
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
