import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import {
  normalizeFloorPlanPayload,
  parseFloorPlanJson,
  readFloorPlan,
  writeFloorPlan,
} from "@/lib/floor-plan";
import type { FloorPlanPayload } from "@/types/floor-plan";

export const runtime = "nodejs";

function isFloorPlanPayload(x: unknown): x is FloorPlanPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.tables)) return false;
  return true;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const floorPlan = await readFloorPlan();
  return NextResponse.json({ floorPlan });
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isFloorPlanPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = parseFloorPlanJson(body);
  if (parsed.tables.length !== body.tables.length) {
    return NextResponse.json(
      { error: "Each table needs a non-empty id and label." },
      { status: 400 },
    );
  }
  try {
    await writeFloorPlan(normalizeFloorPlanPayload(parsed));
  } catch (e) {
    console.error("PUT /api/admin/floor-plan:", e);
    const message =
      e instanceof Error ? e.message : "Failed to save floor plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
