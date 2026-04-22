import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

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
  const where = Object.keys(occurredAt).length ? { occurredAt } : {};

  const [expenseAgg, personalCashAgg, personalStockCount, personalOrderCount] =
    await prisma.$transaction([
      prisma.expenseEntry.aggregate({
        where,
        _sum: { amountPaise: true },
        _count: { _all: true },
      }),
      prisma.personalUseEntry.aggregate({
        where: { ...where, kind: "CASH" },
        _sum: { cashAmountPaise: true },
        _count: { _all: true },
      }),
      prisma.personalUseEntry.aggregate({
        where: { ...where, kind: "STOCK" },
        _count: { _all: true },
      }),
      prisma.personalUseEntry.aggregate({
        where: { ...where, kind: "ORDER" },
        _count: { _all: true },
      }),
    ]);

  return NextResponse.json({
    business: {
      count: expenseAgg._count._all,
      totalPaise: expenseAgg._sum.amountPaise ?? 0,
    },
    personal: {
      cashCount: personalCashAgg._count._all,
      cashTotalPaise: personalCashAgg._sum.cashAmountPaise ?? 0,
      stockCount: personalStockCount._count._all,
      orderCount: personalOrderCount._count._all,
    },
  });
}

