import { NextResponse } from "next/server";

import { readRestaurantSettings } from "@/lib/settings-repository";
import { isWhatsAppCloudConfigured } from "@/lib/whatsapp-cloud";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const full = await readRestaurantSettings();
  return NextResponse.json(
    {
      displayName: full.displayName,
      logoUrl: full.logoUrl,
      whatsappPhoneE164: full.whatsappPhoneE164,
      pickup: full.pickup,
      delivery: full.delivery,
      whatsappCloudConfigured: isWhatsAppCloudConfigured(),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
