/**
 * Website (online) checkout minimum, based on item subtotal only.
 * Delivery fee is not counted. 0 = no minimum.
 */

export function normalizeMinOnlineOrderAmount(input: unknown): number {
  const n =
    typeof input === "number"
      ? input
      : typeof input === "string"
        ? Number(input.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function itemsSubtotalRupeesFromLines(
  lines: ReadonlyArray<{ unitPrice: number; quantity: number }>,
): number {
  let sum = 0;
  for (const line of lines) {
    sum += line.unitPrice * line.quantity;
  }
  return sum;
}

/** How much more (₹) the cart needs to reach the minimum. 0 if already met or min is 0. */
export function onlineOrderMinShortfallRupees(
  itemsSubtotalRupees: number,
  minOnlineOrderAmount: number,
): number {
  const min = normalizeMinOnlineOrderAmount(minOnlineOrderAmount);
  if (min <= 0) return 0;
  const subtotal = Number.isFinite(itemsSubtotalRupees) ? itemsSubtotalRupees : 0;
  return Math.max(0, Math.round((min - subtotal) * 100) / 100);
}

export function minOnlineOrderMessage(
  shortfallRupees: number,
  minOnlineOrderAmount: number,
): string {
  const min = normalizeMinOnlineOrderAmount(minOnlineOrderAmount);
  const shortfall = Math.round(shortfallRupees);
  const minRounded = Math.round(min);
  return `Add ₹${shortfall} more to reach the ₹${minRounded} minimum order.`;
}
