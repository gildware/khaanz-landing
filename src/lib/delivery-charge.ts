/**
 * Delivery fee model (per started km, bracketed):
 *   - Free within `freeDeliveryUptoKm` of the restaurant.
 *   - The first km past the free radius costs `baseDeliveryCharge` (flat).
 *   - Each additional started km adds `deliveryPerKmCharge`.
 *
 * Example: free = 1 km, base = ₹20, perKm = ₹10
 *   0–1 km   → free
 *   1–2 km   → ₹20   (base)
 *   2–3 km   → ₹30   (base + 1 × perKm)
 *   3–4 km   → ₹40   (base + 2 × perKm)
 *
 * i.e. charge = base + perKm × (ceil(km − free) − 1) for km beyond the free radius.
 */

export type DeliveryChargeConfig = {
  freeDeliveryUptoKm: number;
  baseDeliveryCharge: number;
  deliveryPerKmCharge: number;
};

/** Delivery fee in rupees for a driving distance (meters). Always whole rupees. */
export function computeDeliveryChargeRupees(
  distanceMeters: number | null | undefined,
  config: DeliveryChargeConfig,
): number {
  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0
  ) {
    return 0;
  }

  const freeKm = Math.max(0, config.freeDeliveryUptoKm);
  const km = distanceMeters / 1000;
  if (km <= freeKm) return 0;

  const base = Math.max(0, config.baseDeliveryCharge);
  const perKm = Math.max(0, config.deliveryPerKmCharge);

  // Number of started kilometres beyond the free radius (>= 1 here).
  const brackets = Math.ceil(km - freeKm);
  const charge = base + perKm * (brackets - 1);
  return Math.max(0, Math.round(charge));
}

/** Delivery fee in minor units (paise). */
export function computeDeliveryChargeMinor(
  distanceMeters: number | null | undefined,
  config: DeliveryChargeConfig,
): number {
  return computeDeliveryChargeRupees(distanceMeters, config) * 100;
}
