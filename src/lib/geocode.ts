export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });
  const res = await fetch(`/api/geocode?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Could not resolve address");
  }
  const data = (await res.json()) as { displayName?: string };
  if (!data.displayName) {
    throw new Error("Empty address");
  }
  return data.displayName;
}

export type GeocodeSearchHit = {
  lat: number;
  lon: number;
  displayName: string;
};

export type TravelDistanceResult = {
  text: string;
  meters: number;
  durationText: string;
  durationSeconds: number;
};

export type TravelDistanceResponse = {
  configured: boolean;
  distance: TravelDistanceResult | null;
  /** Delivery fee in rupees for this location (null when distance unknown). */
  deliveryCharge: number | null;
  freeDeliveryUptoKm: number;
  baseDeliveryCharge: number;
  deliveryPerKmCharge: number;
};

export async function fetchTravelDistance(
  lat: number,
  lng: number,
): Promise<TravelDistanceResponse> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/distance?${params.toString()}`);
  if (!res.ok) {
    return {
      configured: false,
      distance: null,
      deliveryCharge: null,
      freeDeliveryUptoKm: 0,
      baseDeliveryCharge: 0,
      deliveryPerKmCharge: 0,
    };
  }
  const data = (await res.json()) as Partial<TravelDistanceResponse>;
  return {
    configured: data.configured === true,
    distance: data.distance ?? null,
    deliveryCharge:
      typeof data.deliveryCharge === "number" ? data.deliveryCharge : null,
    freeDeliveryUptoKm:
      typeof data.freeDeliveryUptoKm === "number" ? data.freeDeliveryUptoKm : 0,
    baseDeliveryCharge:
      typeof data.baseDeliveryCharge === "number" ? data.baseDeliveryCharge : 0,
    deliveryPerKmCharge:
      typeof data.deliveryPerKmCharge === "number"
        ? data.deliveryPerKmCharge
        : 0,
  };
}

export async function searchPlaces(query: string): Promise<GeocodeSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(
    `/api/geocode/search?${new URLSearchParams({ q }).toString()}`,
  );
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as { results?: GeocodeSearchHit[] };
  return Array.isArray(data.results) ? data.results : [];
}
