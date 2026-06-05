import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Tab labels on the restaurant Orders admin page (POS / dine-in). */
export const RESTAURANT_ORDER_STATUS_TAB_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Ready",
  DELIVERED: "Completed",
  CANCELLED: "Cancelled",
};

/** Status badge text for in-restaurant orders (fulfillment-aware). */
export function restaurantOrderStatusLabel(
  status: OrderStatus,
  fulfillment: string,
): string {
  switch (status) {
    case "OUT_FOR_DELIVERY":
      if (fulfillment === "dine_in") return "Ready to serve";
      if (fulfillment === "pickup") return "Ready for pickup";
      return ORDER_STATUS_LABEL.OUT_FOR_DELIVERY;
    case "DELIVERED":
      if (fulfillment === "dine_in") return "Served";
      if (fulfillment === "pickup") return "Picked up";
      return ORDER_STATUS_LABEL.DELIVERED;
    default:
      return ORDER_STATUS_LABEL[status];
  }
}

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
