import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseIntPaise(x: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  const v = Math.trunc(n);
  if (v < 0) return { ok: false, error: `${field} must be >= 0` };
  return { ok: true, value: v };
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const categoryId = (url.searchParams.get("categoryId") ?? "").trim();

  const occurredAt: { gte?: Date; lt?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) occurredAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) occurredAt.lt = d;
  }

  const prisma = getPrisma();
  const entries = await prisma.expenseEntry.findMany({
    where: {
      ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      categoryId: true,
      occurredAt: true,
      amountPaise: true,
      note: true,
      createdAt: true,
      category: { select: { name: true, group: true } },
    },
  });

  return NextResponse.json({ entries });
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

  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

  const amount = parseIntPaise(body.amountPaise, "amountPaise");
  if (!amount.ok) return NextResponse.json({ error: amount.error }, { status: 400 });
  if (amount.value <= 0) return NextResponse.json({ error: "amountPaise must be > 0" }, { status: 400 });

  const occurredAt =
    typeof body.occurredAt === "string" && body.occurredAt
      ? new Date(body.occurredAt)
      : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid occurredAt" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const entry = await prisma.expenseEntry.create({
      data: {
        categoryId,
        occurredAt,
        amountPaise: amount.value,
        note: note.slice(0, 500),
        createdById: session.userId,
      },
      select: {
        id: true,
        categoryId: true,
        occurredAt: true,
        amountPaise: true,
        note: true,
        createdAt: true,
        category: { select: { name: true, group: true } },
      },
    });
    return NextResponse.json({ entry });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

