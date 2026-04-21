import { NextResponse } from "next/server";

type GeocodeSearchHit = {
  lat: number;
  lon: number;
  displayName: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] as GeocodeSearchHit[] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "KhaanzRestaurantOrder/1.0 (support@khaanz.local)",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Search failed", results: [] as GeocodeSearchHit[] },
      { status: 502 },
    );
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ results: [] as GeocodeSearchHit[] });
  }

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

  return NextResponse.json({ results });
}
