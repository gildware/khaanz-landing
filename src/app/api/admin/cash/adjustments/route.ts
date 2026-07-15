import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { parseIstDateInput } from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parsePaise(
  x: unknown,
  field: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  const v = Math.trunc(n);
  if (v === 0) return { ok: false, error: `${field} must not be 0` };
  return { ok: true, value: v };
}

const select = {
  id: true,
  occurredAt: true,
  amountPaise: true,
  note: true,
  createdAt: true,
} as const;

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const occurredAt: { gte?: Date; lt?: Date } = {};
  if (fromRaw) {
    const d = parseIstDateInput(fromRaw) ?? new Date(fromRaw);
    if (!Number.isNaN(d.getTime())) occurredAt.gte = d;
  }
  if (toRaw) {
    const d = parseIstDateInput(toRaw) ?? new Date(toRaw);
    if (!Number.isNaN(d.getTime())) occurredAt.lt = d;
  }

  const prisma = getPrisma();
  const adjustments = await prisma.cashAdjustment.findMany({
    where: Object.keys(occurredAt).length ? { occurredAt } : undefined,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select,
  });

  return NextResponse.json({ adjustments });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = parsePaise(body.amountPaise, "amountPaise");
  if (!amount.ok) {
    return NextResponse.json({ error: amount.error }, { status: 400 });
  }

  let occurredAt = new Date();
  if (typeof body.occurredAt === "string" && body.occurredAt.trim()) {
    const parsed = new Date(body.occurredAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "occurredAt invalid" }, { status: 400 });
    }
    occurredAt = parsed;
  } else if (typeof body.occurredDate === "string" && body.occurredDate.trim()) {
    const parsed = parseIstDateInput(body.occurredDate.trim());
    if (!parsed) {
      return NextResponse.json(
        { error: "occurredDate must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    // Midday IST so day bucketing is stable.
    occurredAt = new Date(`${body.occurredDate.trim()}T12:00:00+05:30`);
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const prisma = getPrisma();
  const adjustment = await prisma.cashAdjustment.create({
    data: {
      occurredAt,
      amountPaise: amount.value,
      note,
      createdById: session.userId,
    },
    select,
  });

  return NextResponse.json({ adjustment }, { status: 201 });
}
