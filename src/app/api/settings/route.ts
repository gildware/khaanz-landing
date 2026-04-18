import { NextResponse } from "next/server";

import {
  ensureSettingsFile,
  readRestaurantSettings,
} from "@/lib/settings-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  await ensureSettingsFile();
  const payload = await readRestaurantSettings();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
