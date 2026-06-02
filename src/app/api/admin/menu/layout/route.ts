import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { writeMenuLayout } from "@/lib/menu-repository";

type LayoutPayload = {
  categories: string[];
  items: { id: string; available: boolean }[];
};

function parseLayout(body: unknown): LayoutPayload | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.categories) || !Array.isArray(o.items)) return null;

  const categories: string[] = [];
  for (const c of o.categories) {
    if (typeof c === "string" && c.trim()) categories.push(c.trim());
  }

  const items: { id: string; available: boolean }[] = [];
  for (const raw of o.items) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return null;
    items.push({ id: r.id, available: r.available !== false });
  }

  return { categories, items };
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

  const layout = parseLayout(body);
  if (!layout) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await writeMenuLayout(layout);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
