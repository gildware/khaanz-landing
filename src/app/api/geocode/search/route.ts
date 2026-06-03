import { NextResponse } from "next/server";

import { autocompletePlaces } from "@/lib/google-places";

export const runtime = "nodejs";

type GeocodeSearchHit = {
  lat?: number;
  lon?: number;
  displayName: string;
  placeId?: string;
};

async function searchNominatim(q: string): Promise<GeocodeSearchHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "KhaanzRestaurantOrder/1.0 (support@khaanz.local)",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) return [];

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) return [];

  const results: GeocodeSearchHit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const lat = Number(o.lat);
    const lon = Number(o.lon);
    const displayName =
      typeof o.display_name === "string" ? o.display_name : "";
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !displayName) {
      continue;
    }
    results.push({ lat, lon, displayName });
  }

  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] as GeocodeSearchHit[] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    const suggestions = await autocompletePlaces(q, apiKey);
    if (suggestions.length > 0) {
      return NextResponse.json({
        provider: "google",
        results: suggestions.map((s) => ({
          placeId: s.placeId,
          displayName: s.displayName,
        })),
      });
    }
  }

  const results = await searchNominatim(q);
  return NextResponse.json({ provider: "nominatim", results });
}
