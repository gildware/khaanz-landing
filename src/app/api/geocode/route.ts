import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "KhaanzRestaurantOrder/1.0 (support@khaanz.local)",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Geocoding failed" },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { display_name?: string };
  return NextResponse.json({ displayName: data.display_name ?? "" });
}
