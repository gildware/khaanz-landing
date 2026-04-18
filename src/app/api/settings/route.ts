import { NextResponse } from "next/server";

import {
  ensureSettingsFile,
  readRestaurantSettings,
} from "@/lib/settings-repository";
import { isWhatsAppCloudConfigured } from "@/lib/whatsapp-cloud";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSettingsFile();
  const payload = await readRestaurantSettings();
  return NextResponse.json(
    {
      ...payload,
      whatsappCloudConfigured: isWhatsAppCloudConfigured(),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
