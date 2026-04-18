import { NextResponse } from "next/server";

import { readMenuPayload } from "@/lib/menu-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await readMenuPayload();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
