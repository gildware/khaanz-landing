import { NextResponse } from "next/server";

import { computeDeliveryChargeRupees } from "@/lib/delivery-charge";
import { readRestaurantSettings } from "@/lib/settings-repository";
import {
  getTravelDistance,
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
  const distanceMatrixReady = isTravelDistanceConfigured();

  if (!distanceMatrixReady) {
    const flatFallback =
      pricing.baseDeliveryCharge > 0 ? pricing.baseDeliveryCharge : null;
    return NextResponse.json({
      configured: true,
      distanceMatrixReady: false,
      distance: null,
      deliveryCharge: flatFallback,
      ...pricing,
    });
  }

  const distance = await getTravelDistance(lat, lng);

  const deliveryCharge = distance
    ? computeDeliveryChargeRupees(distance.meters, pricing)
    : pricing.baseDeliveryCharge > 0
      ? pricing.baseDeliveryCharge
      : null;

  return NextResponse.json({
    configured: true,
    distanceMatrixReady: true,
    distance,
    deliveryCharge,
    ...pricing,
  });
}
