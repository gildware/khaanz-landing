import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { writeMenuItem, deleteMenuItem } from "@/lib/menu-repository";
import type { MenuItem } from "@/types/menu";

function parseMenuItem(body: unknown): MenuItem | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  if (typeof o.name !== "string") return null;
  if (typeof o.category !== "string" || !o.category.trim()) return null;
  if (typeof o.isVeg !== "boolean") return null;
  if (!Array.isArray(o.variations) || o.variations.length === 0) return null;
  if (!Array.isArray(o.addons)) return null;

  const variations = o.variations.map((v) => {
    if (!v || typeof v !== "object") return null;
    const row = v as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim()) return null;
    if (typeof row.name !== "string") return null;
    if (typeof row.price !== "number" || !Number.isFinite(row.price)) return null;
    return { id: row.id.trim(), name: row.name, price: row.price };
  });
  if (variations.some((v) => v === null)) return null;

  const addons = o.addons.map((a) => {
    if (!a || typeof a !== "object") return null;
    const row = a as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim()) return null;
    if (typeof row.name !== "string") return null;
    if (typeof row.price !== "number" || !Number.isFinite(row.price)) return null;
    return { id: row.id.trim(), name: row.name, price: row.price };
  });
  if (addons.some((a) => a === null)) return null;

  return {
    id: o.id.trim(),
    name: o.name,
    category: o.category.trim(),
    description: typeof o.description === "string" ? o.description : "",
    image: typeof o.image === "string" ? o.image : "",
    isVeg: o.isVeg,
    variations: variations as MenuItem["variations"],
    addons: addons as MenuItem["addons"],
    recommended: o.recommended === true ? true : undefined,
    available: o.available === false ? false : undefined,
    notForSale: o.notForSale === true ? true : undefined,
  };
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

  const item = parseMenuItem(body);
  if (!item) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await writeMenuItem(item);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing item id" }, { status: 400 });
  }

  try {
    await deleteMenuItem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
