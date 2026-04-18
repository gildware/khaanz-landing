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
