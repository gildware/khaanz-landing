import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { isOrderStatus, updateOrderStatus } from "@/lib/update-order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireSyncKey(req: Request): boolean {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return false;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  return Boolean(got && got === expected);
}

type RouteContext = { params: Promise<{ orderId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!requireSyncKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isOrderStatus(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await updateOrderStatus(orderId.trim(), body.status as OrderStatus);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
