import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { normalizeMenuCombos } from "@/lib/menu-combos";
import { deleteMenuCombo, writeMenuCombo } from "@/lib/menu-repository";
import type { MenuCombo } from "@/types/menu";

function parseMenuCombo(body: unknown): MenuCombo | null {
  if (!body || typeof body !== "object") return null;
  const normalized = normalizeMenuCombos([body as MenuCombo]);
  return normalized[0] ?? null;
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

  const combo = parseMenuCombo(body);
  if (!combo) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await writeMenuCombo(combo);
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
    return NextResponse.json({ error: "Missing combo id" }, { status: 400 });
  }

  try {
    await deleteMenuCombo(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
