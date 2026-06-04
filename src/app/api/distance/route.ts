import { NextResponse } from "next/server";

import { computeDeliveryChargeRupees } from "@/lib/delivery-charge";
import { readRestaurantSettings } from "@/lib/settings-repository";
import {
  getTravelDistance,
  isGoogleDistanceMatrixEnabled,
  isTravelDistanceConfigured,
} from "@/lib/travel-distance";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng required" },
      { status: 400 },
    );
  }

  const settings = await readRestaurantSettings();
  const pricing = {
    freeDeliveryUptoKm: settings.freeDeliveryUptoKm,
    baseDeliveryCharge: settings.baseDeliveryCharge,
    deliveryPerKmCharge: settings.deliveryPerKmCharge,
  };

  const originConfigured = await isTravelDistanceConfigured();
  const distanceMatrixReady =
    originConfigured && isGoogleDistanceMatrixEnabled();

  if (!originConfigured) {
    return NextResponse.json({
      configured: true,
      originConfigured: false,
      distanceMatrixReady: false,
      distance: null,
      deliveryCharge: null,
      ...pricing,
    });
  }

  const distance = await getTravelDistance(lat, lng);

  const deliveryCharge = distance
    ? computeDeliveryChargeRupees(distance.meters, pricing)
    : null;

  return NextResponse.json({
    configured: true,
    originConfigured: true,
    distanceMatrixReady,
    distance,
    deliveryCharge,
    ...pricing,
  });
}
