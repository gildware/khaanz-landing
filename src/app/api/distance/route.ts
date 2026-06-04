import { NextResponse } from "next/server";

import {
  computeDeliveryChargeRupees,
  isDeliverableDistance,
} from "@/lib/delivery-charge";
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
    maxDeliveryDistanceKm: settings.maxDeliveryDistanceKm,
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
      deliverable: false,
      ...pricing,
    });
  }

  const distance = await getTravelDistance(lat, lng);

  const deliverable =
    distance != null &&
    isDeliverableDistance(distance.meters, settings.maxDeliveryDistanceKm);

  const deliveryCharge = deliverable
    ? computeDeliveryChargeRupees(distance!.meters, pricing)
    : null;

  return NextResponse.json({
    configured: true,
    originConfigured: true,
    distanceMatrixReady,
    distance,
    deliverable,
    deliveryCharge,
    ...pricing,
  });
}
