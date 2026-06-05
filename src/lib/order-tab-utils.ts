import type { OrderStatus } from "@prisma/client";

/** Map legacy/local statuses onto workflow tabs. */
export function normalizeOrderStatus(status: string): OrderStatus | string {
  const upper = String(status || "").trim().toUpperCase();
  if (upper === "CREATED") return "PENDING";
  return upper;
}

export function filterOrdersByStatusTab<T extends { status: string }>(
  orders: T[],
  tab: "all" | OrderStatus | string,
): T[] {
  if (tab === "all") return orders;
  return orders.filter((o) => normalizeOrderStatus(o.status) === tab);
}

export function countOrdersByStatus(orders: { status: string }[]): {
  total: number;
  byStatus: Partial<Record<OrderStatus, number>>;
} {
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  for (const o of orders) {
    const key = normalizeOrderStatus(o.status) as OrderStatus;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  return { total: orders.length, byStatus };
}
