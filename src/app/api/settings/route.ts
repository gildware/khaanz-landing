import { NextResponse } from "next/server";

import { readRestaurantSettings } from "@/lib/settings-repository";
import { isTravelDistanceConfigured } from "@/lib/travel-distance";
import { isWhatsAppCloudConfigured } from "@/lib/whatsapp-cloud";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const full = await readRestaurantSettings();
  const deliveryDistanceConfigured = await isTravelDistanceConfigured();
  return NextResponse.json(
    {
      displayName: full.displayName,
      logoUrl: full.logoUrl,
      whatsappPhoneE164: full.whatsappPhoneE164,
      pickup: full.pickup,
      delivery: full.delivery,
      freeDeliveryUptoKm: full.freeDeliveryUptoKm,
      baseDeliveryCharge: full.baseDeliveryCharge,
      deliveryPerKmCharge: full.deliveryPerKmCharge,
      restaurantLatitude: full.restaurantLatitude,
      restaurantLongitude: full.restaurantLongitude,
      deliveryDistanceConfigured,
      whatsappCloudConfigured: isWhatsAppCloudConfigured(),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
