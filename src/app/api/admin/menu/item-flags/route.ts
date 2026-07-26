import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { writeMenuItemFlags } from "@/lib/menu-repository";

function parseItemFlags(body: unknown): {
  id: string;
  available?: boolean;
  notForSale?: boolean;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;

  const flags: {
    id: string;
    available?: boolean;
    notForSale?: boolean;
  } = { id: o.id.trim() };

  if ("available" in o) {
    if (typeof o.available !== "boolean") return null;
    flags.available = o.available;
  }
  if ("notForSale" in o) {
    if (typeof o.notForSale !== "boolean") return null;
    flags.notForSale = o.notForSale;
  }
  if (flags.available === undefined && flags.notForSale === undefined) {
    return null;
  }

  return flags;
}

export async function PATCH(request: Request) {
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

  const parsed = parseItemFlags(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { id, ...flags } = parsed;
  try {
    await writeMenuItemFlags(id, flags);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
