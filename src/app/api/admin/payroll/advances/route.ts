import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AdvanceMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() && /^-?\d+$/.test(v.trim())) {
    return Number.parseInt(v.trim(), 10);
  }
  return null;
}

function isMethod(x: unknown): x is AdvanceMethod {
  return x === "CASH" || x === "RECHARGE" || x === "OTHER";
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("monthKey");

  const prisma = getPrisma();
  const where: Prisma.EmployeeAdvanceWhereInput = {};
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
    const [yStr, mStr] = monthKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
    where.occurredAt = { gte: start, lt: end };
  }

  const rows = await prisma.employeeAdvance.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }],
    select: {
      id: true,
      employeeId: true,
      occurredAt: true,
      amountPaise: true,
      method: true,
      reference: true,
      note: true,
      employee: { select: { name: true, code: true } },
    },
  });

  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;

  const employeeId = typeof o.employeeId === "string" ? o.employeeId : "";
  const occurredAt =
    typeof o.occurredAt === "string" && o.occurredAt.trim()
      ? new Date(o.occurredAt)
      : null;
  const amountPaise = asInt(o.amountPaise);
  const method = o.method;
  const reference = typeof o.reference === "string" ? o.reference.trim().slice(0, 120) : "";
  const note = typeof o.note === "string" ? o.note.trim() : "";

  if (!employeeId) {
    return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  }
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Date is required." }, { status: 400 });
  }
  if (amountPaise === null || amountPaise <= 0) {
    return NextResponse.json({ error: "Amount must be > 0." }, { status: 400 });
  }
  if (!isMethod(method)) {
    return NextResponse.json({ error: "Invalid method." }, { status: 400 });
  }

  const prisma = getPrisma();
  const created = await prisma.employeeAdvance.create({
    data: {
      employeeId,
      occurredAt,
      amountPaise,
      method,
      reference,
      note,
      createdById: session.userId,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

