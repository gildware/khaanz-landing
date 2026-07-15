import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import {
  cashBalanceBefore,
  ensureCashPoolSettings,
} from "@/lib/cash/cash-pool";
import {
  formatIstDateInput,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parsePaise(
  x: unknown,
  field: string,
  opts?: { allowNegative?: boolean },
): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  const v = Math.trunc(n);
  if (!opts?.allowNegative && v < 0) {
    return { ok: false, error: `${field} must be >= 0` };
  }
  return { ok: true, value: v };
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const opening = await ensureCashPoolSettings(prisma);
  const todayKey = formatIstDateInput(new Date());
  const tomorrow = new Date(parseIstDateInput(todayKey)!.getTime() + 24 * 60 * 60 * 1000);
  const balanceTodayPaise = await cashBalanceBefore(prisma, tomorrow, opening);

  return NextResponse.json({
    openingBalancePaise: opening.openingBalancePaise,
    openingEffectiveAt: opening.openingEffectiveAt.toISOString(),
    openingEffectiveDate: formatIstDateInput(opening.openingEffectiveAt),
    note: opening.note,
    balanceTodayPaise,
  });
}

export async function PUT(request: Request) {
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

  const amount = parsePaise(body.openingBalancePaise, "openingBalancePaise");
  if (!amount.ok) {
    return NextResponse.json({ error: amount.error }, { status: 400 });
  }

  const dateRaw =
    typeof body.openingEffectiveDate === "string"
      ? body.openingEffectiveDate.trim()
      : "";
  const openingEffectiveAt = parseIstDateInput(dateRaw);
  if (!openingEffectiveAt) {
    return NextResponse.json(
      { error: "openingEffectiveDate must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const prisma = getPrisma();
  await ensureCashPoolSettings(prisma);
  const updated = await prisma.cashPoolSettings.update({
    where: { id: "default" },
    data: {
      openingBalancePaise: amount.value,
      openingEffectiveAt,
      note,
    },
  });

  return NextResponse.json({
    openingBalancePaise: updated.openingBalancePaise,
    openingEffectiveAt: updated.openingEffectiveAt.toISOString(),
    openingEffectiveDate: formatIstDateInput(updated.openingEffectiveAt),
    note: updated.note,
  });
}
