import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { buildCashDailyTable } from "@/lib/cash/cash-pool";
import {
  formatIstDateInput,
  istMonthKey,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseMonthKey(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const start = parseIstDateInput(`${raw}-01`);
  return start ? raw : null;
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const monthKey = parseMonthKey(url.searchParams.get("month")) ?? istMonthKey(now);
  const prisma = getPrisma();
  const table = await buildCashDailyTable(prisma, monthKey, now);

  return NextResponse.json({
    ...table,
    opening: {
      openingBalancePaise: table.opening.openingBalancePaise,
      openingEffectiveAt: table.opening.openingEffectiveAt.toISOString(),
      openingEffectiveDate: formatIstDateInput(table.opening.openingEffectiveAt),
      note: table.opening.note,
    },
  });
}
