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

  if (!isTravelDistanceConfigured()) {
    return NextResponse.json({
      configured: false,
      distance: null,
      deliveryCharge: null,
      freeDeliveryUptoKm: 0,
      baseDeliveryCharge: 0,
      deliveryPerKmCharge: 0,
    });
  }

  const [distance, settings] = await Promise.all([
    getTravelDistance(lat, lng),
    readRestaurantSettings(),
  ]);

  const deliveryCharge = distance
    ? computeDeliveryChargeRupees(distance.meters, {
        freeDeliveryUptoKm: settings.freeDeliveryUptoKm,
        baseDeliveryCharge: settings.baseDeliveryCharge,
        deliveryPerKmCharge: settings.deliveryPerKmCharge,
      })
    : null;

  return NextResponse.json({
    configured: true,
    distance,
    deliveryCharge,
    freeDeliveryUptoKm: settings.freeDeliveryUptoKm,
    baseDeliveryCharge: settings.baseDeliveryCharge,
    deliveryPerKmCharge: settings.deliveryPerKmCharge,
  });
}
