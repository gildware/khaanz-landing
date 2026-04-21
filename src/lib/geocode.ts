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
