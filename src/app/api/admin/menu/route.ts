import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import type { MenuPayload } from "@/types/menu-payload";
import { writeMenuPayload } from "@/lib/menu-repository";

function isPayload(x: unknown): x is MenuPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.categories) &&
    Array.isArray(o.globalAddons) &&
    Array.isArray(o.items) &&
    Array.isArray(o.combos)
  );
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await writeMenuPayload(body);
  return NextResponse.json({ ok: true });
}
