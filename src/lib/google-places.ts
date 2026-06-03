/**
 * Google Places (legacy) — autocomplete + place details for checkout search.
 * Requires GOOGLE_MAPS_API_KEY with "Places API" enabled (same key as Distance Matrix).
 */

export type PlaceSearchSuggestion = {
  placeId: string;
  displayName: string;
};

export type PlaceDetails = {
  lat: number;
  lng: number;
  displayName: string;
};

type AutocompleteResponse = {
  status?: string;
  predictions?: {
    place_id?: string;
    description?: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }[];
};

type PlaceDetailsResponse = {
  status?: string;
  result?: {
    formatted_address?: string;
    geometry?: {
      location?: { lat?: number; lng?: number };
    };
  };
};

/** Autocomplete suggestions biased to India. */
export async function autocompletePlaces(
  input: string,
  apiKey: string,
): Promise<PlaceSearchSuggestion[]> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json",
  );
  url.searchParams.set("input", input);
  url.searchParams.set("components", "country:in");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = (await res.json()) as AutocompleteResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];

  const results: PlaceSearchSuggestion[] = [];
  for (const prediction of data.predictions ?? []) {
    const placeId = prediction.place_id;
    if (!placeId) continue;

    const main = prediction.structured_formatting?.main_text?.trim();
    const secondary = prediction.structured_formatting?.secondary_text?.trim();
    const displayName =
      [main, secondary].filter(Boolean).join(", ") ||
      prediction.description?.trim() ||
      "";
    if (!displayName) continue;

    results.push({ placeId, displayName });
    if (results.length >= 10) break;
  }

  return results;
}

/** Resolve a place ID to coordinates and a formatted address. */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json",
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry,formatted_address");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data = (await res.json()) as PlaceDetailsResponse;
  if (data.status !== "OK" || !data.result) return null;

  const lat = data.result.geometry?.location?.lat;
  const lng = data.result.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const displayName =
    data.result.formatted_address?.trim() || `${lat}, ${lng}`;

  return { lat, lng, displayName };
}
