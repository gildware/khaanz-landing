import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      address: true,
      active: true,
      monthlySalaryPaise: true,
      dailyRatePaise: true,
      paidLeavesPerMonth: true,
      joinedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ employees });
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

  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  const code = typeof o.code === "string" ? o.code.trim().slice(0, 32) : "";
  const phone = typeof o.phone === "string" ? o.phone.trim().slice(0, 32) : "";
  const address = typeof o.address === "string" ? o.address.trim() : "";
  const active = typeof o.active === "boolean" ? o.active : true;
  const monthlySalaryPaise = asInt(o.monthlySalaryPaise);
  const dailyRatePaise = asInt(o.dailyRatePaise);
  const paidLeavesPerMonth = asInt(o.paidLeavesPerMonth) ?? 4;
  const joinedAt =
    typeof o.joinedAt === "string" && o.joinedAt.trim()
      ? new Date(o.joinedAt)
      : null;

  if (!name) {
    return NextResponse.json({ error: "Employee name is required." }, { status: 400 });
  }
  if (monthlySalaryPaise === null || monthlySalaryPaise < 0) {
    return NextResponse.json(
      { error: "Monthly salary (paise) must be a valid number." },
      { status: 400 },
    );
  }
  if (dailyRatePaise === null || dailyRatePaise < 0) {
    return NextResponse.json(
      { error: "Daily rate (paise) must be a valid number." },
      { status: 400 },
    );
  }
  if (paidLeavesPerMonth < 0 || paidLeavesPerMonth > 31) {
    return NextResponse.json(
      { error: "Paid leaves per month must be between 0 and 31." },
      { status: 400 },
    );
  }
  if (joinedAt && Number.isNaN(joinedAt.getTime())) {
    return NextResponse.json({ error: "Invalid join date." }, { status: 400 });
  }

  const prisma = getPrisma();
  const created = await prisma.employee.create({
    data: {
      name,
      code,
      phone,
      address,
      active,
      monthlySalaryPaise,
      dailyRatePaise,
      paidLeavesPerMonth,
      joinedAt: joinedAt ?? undefined,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}

