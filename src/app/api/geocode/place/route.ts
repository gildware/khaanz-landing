import { NextResponse } from "next/server";

import { getPlaceDetails } from "@/lib/google-places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";
  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Place lookup is not configured" },
      { status: 503 },
    );
  }

  const place = await getPlaceDetails(placeId, apiKey);
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json({
    lat: place.lat,
    lng: place.lng,
    displayName: place.displayName,
  });
}
