import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";
import type { ExpenseCategoryGroup } from "@prisma/client";

export const runtime = "nodejs";

const GROUPS: ExpenseCategoryGroup[] = ["RAW_MATERIAL", "BILLS", "OTHER"];

function isGroup(x: unknown): x is ExpenseCategoryGroup {
  return typeof x === "string" && GROUPS.includes(x as ExpenseCategoryGroup);
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  const categories = await prisma.expenseCategory.findMany({
    where: { active: true },
    orderBy: [{ group: "asc" }, { name: "asc" }],
    select: { id: true, name: true, group: true, active: true },
  });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 80) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }

  const group = isGroup(body.group) ? body.group : "OTHER";

  const prisma = getPrisma();
  try {
    const row = await prisma.expenseCategory.create({
      data: { name, group, active: true },
      select: { id: true, name: true, group: true, active: true },
    });
    return NextResponse.json({ category: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

