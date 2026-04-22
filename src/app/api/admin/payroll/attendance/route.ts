import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AttendanceKind } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

function monthRange(monthKey: string): { startDayKey: string; endDayKey: string } {
  const [yStr, mStr] = monthKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const startDayKey = `${yStr}-${mStr}-01`;
  const next = new Date(Date.UTC(y, m - 1 + 1, 1));
  const endY = next.getUTCFullYear();
  const endM = String(next.getUTCMonth() + 1).padStart(2, "0");
  const endDayKey = `${endY}-${endM}-01`;
  return { startDayKey, endDayKey };
}

function isAttendanceKind(x: unknown): x is AttendanceKind {
  return (
    x === "WORKED" ||
    x === "LEAVE" ||
    x === "ABSENT" ||
    x === "WORKED_ON_LEAVE"
  );
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("monthKey") ?? "";
  if (!isMonthKey(monthKey)) {
    return NextResponse.json({ error: "monthKey is required (YYYY-MM)." }, { status: 400 });
  }
  const { startDayKey, endDayKey } = monthRange(monthKey);

  const prisma = getPrisma();
  const rows = await prisma.attendanceDay.findMany({
    where: {
      dayKey: { gte: startDayKey, lt: endDayKey },
    },
    select: {
      id: true,
      employeeId: true,
      dayKey: true,
      kind: true,
      note: true,
      updatedAt: true,
    },
    orderBy: [{ dayKey: "asc" }],
  });

  return NextResponse.json({ monthKey, rows });
}

export async function PUT(request: Request) {
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
  const dayKey = typeof o.dayKey === "string" ? o.dayKey : "";
  const kind = o.kind;
  const note = typeof o.note === "string" ? o.note.trim() : "";

  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !isAttendanceKind(kind)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const prisma = getPrisma();
  const row = await prisma.attendanceDay.upsert({
    where: { employeeId_dayKey: { employeeId, dayKey } },
    create: {
      employeeId,
      dayKey,
      kind,
      note,
      createdById: session.userId,
    },
    update: { kind, note },
    select: { id: true, employeeId: true, dayKey: true, kind: true, note: true },
  });

  return NextResponse.json({ ok: true, row });
}

