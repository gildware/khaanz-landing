import type { CartLine } from "@/types/menu";

/** Sum of line `unitPrice × quantity` in minor units (paise). */
export function itemsSubtotalMinor(lines: CartLine[]): number {
  let sum = 0;
  for (const line of lines) {
    sum += Math.round(line.unitPrice * line.quantity * 100);
  }
  return sum;
}

/** Final order total in minor units: items + delivery − discount (clamped ≥ 0). */
export function computeOrderTotalMinor(args: {
  lines: CartLine[];
  deliveryChargeMinor?: number;
  discountMinor?: number;
}): number {
  const items = itemsSubtotalMinor(args.lines);
  const delivery = Math.max(0, args.deliveryChargeMinor ?? 0);
  const discount = Math.max(0, args.discountMinor ?? 0);
  const beforeDiscount = items + delivery;
  return Math.max(0, beforeDiscount - Math.min(discount, beforeDiscount));
}
