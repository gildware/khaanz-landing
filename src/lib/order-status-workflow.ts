import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const LINEAR: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export function canAdminSetOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  if (to === "CANCELLED") {
    return from !== "DELIVERED" && from !== "CANCELLED";
  }
  if (from === "CANCELLED" || from === "DELIVERED") return false;
  const i = LINEAR.indexOf(from);
  const j = LINEAR.indexOf(to);
  if (i < 0 || j < 0) return false;
  return j === i + 1;
}

export function customerStatusMessage(
  displayOrderId: string,
  status: OrderStatus,
): string {
  const label = ORDER_STATUS_LABEL[status];
  return `*Khaanz order ${displayOrderId}*\nStatus: *${label}*\nWe'll keep you updated here.`;
}
