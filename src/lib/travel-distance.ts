/**
 * Distance from the restaurant to a customer location.
 * Prefers Google Distance Matrix (driving) when GOOGLE_MAPS_API_KEY is set;
 * otherwise uses straight-line (haversine) distance when origin coordinates exist
 * (admin settings or RESTAURANT_LATITUDE/LONGITUDE env).
 */

import {
  readRestaurantSettings,
  restaurantCoordsColumnsAvailable,
  RestaurantCoordsMigrationRequiredError,
  writeRestaurantSettings,
} from "@/lib/settings-repository";

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

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { value: TravelDistance | null; at: number }>();
const inFlight = new Map<string, Promise<TravelDistance | null>>();

let originCache: { value: RestaurantOrigin | null; at: number } | null = null;
const ORIGIN_CACHE_TTL_MS = 30_000;
let envCoordsSyncPromise: Promise<void> | null = null;

/**
 * Production Docker does not ship `.env`. When RESTAURANT_LATITUDE/LONGITUDE are
 * set on the running container, copy them into the DB once so distance works
 * without relying on runtime env forever.
 */
async function syncEnvRestaurantCoordsToDbIfNeeded(): Promise<void> {
  if (envCoordsSyncPromise) {
    await envCoordsSyncPromise;
    return;
  }
  envCoordsSyncPromise = (async () => {
    if (!(await restaurantCoordsColumnsAvailable())) return;
    const settings = await readRestaurantSettings();
    if (
      settings.restaurantLatitude != null &&
      settings.restaurantLongitude != null
    ) {
      return;
    }
    const env = getRestaurantOriginFromEnv();
    if (!env) return;
    try {
      await writeRestaurantSettings({
        ...settings,
        restaurantLatitude: env.lat,
        restaurantLongitude: env.lng,
      });
      originCache = null;
    } catch (e) {
      if (e instanceof RestaurantCoordsMigrationRequiredError) return;
      throw e;
    }
  })().finally(() => {
    envCoordsSyncPromise = null;
  });
  await envCoordsSyncPromise;
}

function getRestaurantOriginFromEnv(): RestaurantOrigin | null {
  const lat = Number.parseFloat(process.env.RESTAURANT_LATITUDE ?? "");
  const lng = Number.parseFloat(process.env.RESTAURANT_LONGITUDE ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Restaurant origin from admin settings, then env vars. */
export async function readRestaurantOrigin(): Promise<RestaurantOrigin | null> {
  if (originCache && Date.now() - originCache.at < ORIGIN_CACHE_TTL_MS) {
    return originCache.value;
  }
  await syncEnvRestaurantCoordsToDbIfNeeded();
  const settings = await readRestaurantSettings();
  const lat = settings.restaurantLatitude;
  const lng = settings.restaurantLongitude;
  const value =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? { lat, lng }
      : getRestaurantOriginFromEnv();
  originCache = { value, at: Date.now() };
  return value;
}

/** @deprecated Use `readRestaurantOrigin()` — sync env-only check. */
export function getRestaurantOrigin(): RestaurantOrigin | null {
  return getRestaurantOriginFromEnv();
}

export function isGoogleDistanceMatrixEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

/** True when restaurant coordinates are available (admin or env). */
export async function isTravelDistanceConfigured(): Promise<boolean> {
  return (await readRestaurantOrigin()) !== null;
}

/** Google Maps directions URL from the restaurant to the customer. */
export function buildDirectionsUrl(
  destLat: number,
  destLng: number,
  origin: RestaurantOrigin | null = getRestaurantOriginFromEnv(),
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

async function fetchDrivingDistance(
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
      text: el.distance.text ?? formatDistanceText(el.distance.value ?? 0),
      meters: el.distance.value ?? 0,
      durationText: el.duration.text ?? "",
      durationSeconds: el.duration.value ?? 0,
      estimated: false,
    };
  } catch {
    return null;
  }
}

/**
 * Distance from the restaurant to (destLat, destLng). Driving route when Google
 * is configured; otherwise straight-line when origin coordinates exist.
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

  const origin = await readRestaurantOrigin();
  if (!origin) return null;

  const key = cacheKey(origin, destLat, destLng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  const promise = (async () => {
    let value: TravelDistance | null = null;
    if (apiKey) {
      value = await fetchDrivingDistance(origin, destLat, destLng, apiKey);
    }
    if (!value) {
      value = straightLineDistance(origin, destLat, destLng);
    }
    cache.set(key, { value, at: Date.now() });
    return value;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Clear cached restaurant origin (after admin saves coordinates). */
export function clearRestaurantOriginCache(): void {
  originCache = null;
}
