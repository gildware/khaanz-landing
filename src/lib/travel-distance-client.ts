export type RestaurantOrigin = { lat: number; lng: number };

export type TravelDistance = {
  /** e.g. "5.2 km" */
  text: string;
  /** meters, for fee calculation */
  meters: number;
  /** e.g. "14 mins" — empty when estimated (straight line) */
  durationText: string;
  /** seconds — 0 when estimated */
  durationSeconds: number;
  /** True when driving distance was unavailable and straight-line was used. */
  estimated?: boolean;
};

export function parseCoordinates(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { lat: la, lng: ln };
}

/** Opens Google Maps pinned on the customer's delivery location. */
export function buildCustomerMapUrl(destLat: number, destLng: number): string {
  return `https://www.google.com/maps?q=${destLat},${destLng}`;
}

/** Google Maps URL that just drops a pin on the customer location. */
export function buildLocationUrl(destLat: number, destLng: number): string {
  return buildCustomerMapUrl(destLat, destLng);
}

function formatDistanceText(meters: number): string {
  const km = meters / 1000;
  if (km < 1) return `${Math.max(1, Math.round(meters))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Straight-line distance in meters (haversine). */
export function haversineMeters(
  origin: RestaurantOrigin,
  destLat: number,
  destLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(destLat - origin.lat);
  const dLng = toRad(destLng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destLat)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round(R * c));
}

export function straightLineDistance(
  origin: RestaurantOrigin,
  destLat: number,
  destLng: number,
): TravelDistance {
  const meters = haversineMeters(origin, destLat, destLng);
  return {
    text: formatDistanceText(meters),
    meters,
    durationText: "",
    durationSeconds: 0,
    estimated: true,
  };
}

export function formatDistanceMeters(meters: number): string {
  return formatDistanceText(meters);
}

/** Human-readable distance for order cards and checkout. */
export function formatTravelDistanceLabel(distance: TravelDistance): string {
  if (distance.durationText) {
    return `${distance.text} · ${distance.durationText} drive`;
  }
  if (distance.estimated) {
    return `${distance.text} (straight line)`;
  }
  return distance.text;
}
