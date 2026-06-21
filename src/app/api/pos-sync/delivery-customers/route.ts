import { NextResponse } from "next/server";

import { searchDeliveryCustomers } from "@/lib/delivery-customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireSyncKey(req: Request): string | null {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return null;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  if (!got || got !== expected) return null;
  return got;
}

export async function GET(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const customers = await searchDeliveryCustomers(q);

  return NextResponse.json(
    { ok: true, customers },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
