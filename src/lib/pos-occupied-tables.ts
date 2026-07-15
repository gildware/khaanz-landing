import type { OrderStatus, PrismaClient } from "@prisma/client";

import { DINE_IN_OCCUPYING_STATUSES } from "@/lib/order-status-workflow";

export type OccupiedTableInfo = {
  label: string;
  orderId: string;
  orderRef: string | null;
};

type PrismaLike = Pick<PrismaClient, "order">;

/** Open dine-in orders that still occupy a floor-plan table. */
export async function listOccupiedDineInTables(
  prisma: PrismaLike,
): Promise<OccupiedTableInfo[]> {
  const rows = await prisma.order.findMany({
    where: {
      source: "pos",
      fulfillment: "dine_in",
      dineInTable: { not: "" },
      status: { in: DINE_IN_OCCUPYING_STATUSES },
    },
    select: {
      id: true,
      orderRef: true,
      dineInTable: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const byLabel = new Map<string, OccupiedTableInfo>();
  for (const o of rows) {
    const label = o.dineInTable.trim();
    if (!label || byLabel.has(label)) continue;
    byLabel.set(label, {
      label,
      orderId: o.id,
      orderRef: o.orderRef,
    });
  }
  return [...byLabel.values()];
}

export async function findOccupyingOrderForTable(
  prisma: PrismaLike,
  tableLabel: string,
  opts?: { excludeOrderId?: string | null },
): Promise<{ id: string; orderRef: string | null; status: OrderStatus } | null> {
  const label = tableLabel.trim();
  if (!label) return null;
  const row = await prisma.order.findFirst({
    where: {
      source: "pos",
      fulfillment: "dine_in",
      dineInTable: label,
      status: { in: DINE_IN_OCCUPYING_STATUSES },
      ...(opts?.excludeOrderId
        ? { id: { not: opts.excludeOrderId } }
        : {}),
    },
    select: { id: true, orderRef: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  return row;
}
