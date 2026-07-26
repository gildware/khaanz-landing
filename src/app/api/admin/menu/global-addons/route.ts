import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { writeGlobalAddons } from "@/lib/menu-repository";
import type { MenuAddon } from "@/types/menu";

function parseGlobalAddons(body: unknown): MenuAddon[] | null {
  if (!Array.isArray(body)) return null;
  const out: MenuAddon[] = [];
  for (const el of body) {
    if (!el || typeof el !== "object") return null;
    const o = el as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) return null;
    if (typeof o.name !== "string") return null;
    if (typeof o.price !== "number" || !Number.isFinite(o.price)) return null;
    out.push({ id: o.id.trim(), name: o.name, price: o.price });
  }
  return out;
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

  const addons = parseGlobalAddons(body);
  if (addons === null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await writeGlobalAddons(addons);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
