import { NextResponse } from "next/server";

import { getDesktopPosReleaseInfo } from "@/lib/get-desktop-pos-release-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getDesktopPosReleaseInfo();
  return NextResponse.json(info, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
