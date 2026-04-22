import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() && /^-?\d+$/.test(v.trim())) {
    return Number.parseInt(v.trim(), 10);
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const prisma = getPrisma();
  const emp = await prisma.employee.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ employee: emp });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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

  const patch: Prisma.EmployeeUpdateInput = {};
  if (typeof o.name === "string") patch.name = o.name.trim().slice(0, 120);
  if (typeof o.code === "string") patch.code = o.code.trim().slice(0, 32);
  if (typeof o.phone === "string") patch.phone = o.phone.trim().slice(0, 32);
  if (typeof o.address === "string") patch.address = o.address.trim();
  if (typeof o.active === "boolean") patch.active = o.active;
  if (o.monthlySalaryPaise !== undefined) patch.monthlySalaryPaise = asInt(o.monthlySalaryPaise) ?? undefined;
  if (o.dailyRatePaise !== undefined) patch.dailyRatePaise = asInt(o.dailyRatePaise) ?? undefined;
  if (o.paidLeavesPerMonth !== undefined) patch.paidLeavesPerMonth = asInt(o.paidLeavesPerMonth) ?? undefined;
  if (typeof o.joinedAt === "string") {
    patch.joinedAt = o.joinedAt.trim() ? new Date(o.joinedAt) : null;
  }

  if (patch.name !== undefined && !String(patch.name)) {
    return NextResponse.json({ error: "Employee name is required." }, { status: 400 });
  }
  if (
    patch.monthlySalaryPaise !== undefined &&
    (patch.monthlySalaryPaise === null || Number(patch.monthlySalaryPaise) < 0)
  ) {
    return NextResponse.json(
      { error: "Monthly salary (paise) must be a valid number." },
      { status: 400 },
    );
  }
  if (
    patch.dailyRatePaise !== undefined &&
    (patch.dailyRatePaise === null || Number(patch.dailyRatePaise) < 0)
  ) {
    return NextResponse.json(
      { error: "Daily rate (paise) must be a valid number." },
      { status: 400 },
    );
  }
  if (
    patch.paidLeavesPerMonth !== undefined &&
    (patch.paidLeavesPerMonth === null ||
      Number(patch.paidLeavesPerMonth) < 0 ||
      Number(patch.paidLeavesPerMonth) > 31)
  ) {
    return NextResponse.json(
      { error: "Paid leaves per month must be between 0 and 31." },
      { status: 400 },
    );
  }
  if (patch.joinedAt instanceof Date && Number.isNaN(patch.joinedAt.getTime())) {
    return NextResponse.json({ error: "Invalid join date." }, { status: 400 });
  }

  const prisma = getPrisma();
  const updated = await prisma.employee.update({
    where: { id },
    data: patch,
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const prisma = getPrisma();
  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

