/**
 * Driving distance/ETA from the restaurant to a customer, via the Google Maps
 * Distance Matrix API. Requires two pieces of configuration:
 *   - GOOGLE_MAPS_API_KEY            — server key with Distance Matrix enabled
 *   - RESTAURANT_LATITUDE/LONGITUDE  — the restaurant origin coordinates
 * If either is missing (or Google returns no route) the helpers return null so
 * callers can still show the address + map link without a distance.
 */

export type RestaurantOrigin = { lat: number; lng: number };

export type TravelDistance = {
  /** e.g. "5.2 km" */
  text: string;
  /** straight meters, for sorting/threshold checks */
  meters: number;
  /** e.g. "14 mins" */
  durationText: string;
  /** seconds, for sorting */
  durationSeconds: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // coords never change per order — cache 1h
const cache = new Map<string, { value: TravelDistance | null; at: number }>();
const inFlight = new Map<string, Promise<TravelDistance | null>>();

export function getRestaurantOrigin(): RestaurantOrigin | null {
  const lat = Number.parseFloat(process.env.RESTAURANT_LATITUDE ?? "");
  const lng = Number.parseFloat(process.env.RESTAURANT_LONGITUDE ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function isTravelDistanceConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY) && getRestaurantOrigin() !== null;
}

/** Google Maps directions URL from the restaurant to the customer. */
export function buildDirectionsUrl(
  destLat: number,
  destLng: number,
  origin: RestaurantOrigin | null = getRestaurantOrigin(),
): string {
  const destination = `${destLat},${destLng}`;
  const params = new URLSearchParams({ api: "1", destination });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Maps URL that just drops a pin on the customer location. */
export function buildLocationUrl(destLat: number, destLng: number): string {
  const params = new URLSearchParams({
    api: "1",
    query: `${destLat},${destLng}`,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function cacheKey(o: RestaurantOrigin, dLat: number, dLng: number): string {
  const r = (n: number) => n.toFixed(5);
  return `${r(o.lat)},${r(o.lng)}|${r(dLat)},${r(dLng)}`;
}

async function fetchDistance(
  origin: RestaurantOrigin,
  destLat: number,
  destLng: number,
  apiKey: string,
): Promise<TravelDistance | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", `${destLat},${destLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      rows?: {
        elements?: {
          status?: string;
          distance?: { text?: string; value?: number };
          duration?: { text?: string; value?: number };
        }[];
      }[];
    };
    if (data.status !== "OK") return null;
    const el = data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK" || !el.distance || !el.duration) return null;
    return {
      text: el.distance.text ?? "",
      meters: el.distance.value ?? 0,
      durationText: el.duration.text ?? "",
      durationSeconds: el.duration.value ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Driving distance from the restaurant to (destLat, destLng). Returns null when
 * unconfigured, when coordinates are missing, or when Google has no route.
 * Results are cached in-memory so repeated polling doesn't re-bill the API.
 */
export async function getTravelDistance(
  destLat: number | null | undefined,
  destLng: number | null | undefined,
): Promise<TravelDistance | null> {
  if (
    typeof destLat !== "number" ||
    typeof destLng !== "number" ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return null;
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const origin = getRestaurantOrigin();
  if (!apiKey || !origin) return null;

  const key = cacheKey(origin, destLat, destLng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchDistance(origin, destLat, destLng, apiKey)
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}
