import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";
import type { ExpenseCategoryGroup } from "@prisma/client";

export const runtime = "nodejs";

const GROUPS: ExpenseCategoryGroup[] = ["RAW_MATERIAL", "BILLS", "OTHER"];
function isGroup(x: unknown): x is ExpenseCategoryGroup {
  return typeof x === "string" && GROUPS.includes(x as ExpenseCategoryGroup);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { name?: string; group?: ExpenseCategoryGroup; active?: boolean } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: "name too long" }, { status: 400 });
    data.name = name;
  }
  if (isGroup(body.group)) data.group = body.group;
  if (typeof body.active === "boolean") data.active = body.active;

  const prisma = getPrisma();
  try {
    const row = await prisma.expenseCategory.update({
      where: { id },
      data,
      select: { id: true, name: true, group: true, active: true },
    });
    return NextResponse.json({ category: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const prisma = getPrisma();
  try {
    const row = await prisma.expenseCategory.update({
      where: { id },
      data: { active: false },
      select: { id: true, name: true, group: true, active: true },
    });
    return NextResponse.json({ category: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

