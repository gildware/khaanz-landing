import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  TABLE_CLEARED: "Table cleared",
  CANCELLED: "Cancelled",
};

/** Tab labels on the restaurant Orders admin page (POS / dine-in). */
export const RESTAURANT_ORDER_STATUS_TAB_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Ready",
  DELIVERED: "Completed",
  TABLE_CLEARED: "Cleared",
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
      if (fulfillment === "delivery") return "Sent for delivery";
      return ORDER_STATUS_LABEL.OUT_FOR_DELIVERY;
    case "DELIVERED":
      if (fulfillment === "dine_in") return "Served";
      if (fulfillment === "pickup") return "Picked up by customer";
      return ORDER_STATUS_LABEL.DELIVERED;
    case "TABLE_CLEARED":
      return "Table cleared";
    default:
      return ORDER_STATUS_LABEL[status];
  }
}

const LINEAR_DEFAULT: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** Dine-in: after taken (ACCEPTED) → Served → Table cleared. */
const LINEAR_DINE_IN: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "DELIVERED",
  "TABLE_CLEARED",
];

function linearPath(fulfillment?: string | null): OrderStatus[] {
  return fulfillment === "dine_in" ? LINEAR_DINE_IN : LINEAR_DEFAULT;
}

export function canAdminSetOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment?: string | null,
): boolean {
  if (from === to) return true;

  if (to === "CANCELLED") {
    return (
      from !== "CANCELLED" &&
      from !== "TABLE_CLEARED" &&
      from !== "DELIVERED"
    );
  }

  if (to === "TABLE_CLEARED") {
    return fulfillment === "dine_in" && from === "DELIVERED";
  }

  if (from === "CANCELLED" || from === "TABLE_CLEARED") return false;

  // Dine-in: allow advancing to Served from mid-pipeline statuses that
  // predate the shorter ACCEPTED → DELIVERED path.
  if (
    fulfillment === "dine_in" &&
    to === "DELIVERED" &&
    (from === "ACCEPTED" ||
      from === "PREPARING" ||
      from === "OUT_FOR_DELIVERY" ||
      from === "PENDING")
  ) {
    return true;
  }

  if (from === "DELIVERED") return false;

  const path = linearPath(fulfillment);
  const i = path.indexOf(from);
  const j = path.indexOf(to);
  if (i < 0 || j < 0) return false;
  return j === i + 1;
}

/** Next staff action for POS / kitchen boards. */
export function nextOrderStatusStep(
  status: string,
  fulfillment: string,
): { nextStatus: OrderStatus; label: string } | null {
  if (fulfillment === "dine_in") {
    switch (status) {
      case "PENDING":
        return { nextStatus: "ACCEPTED", label: "Accept" };
      case "ACCEPTED":
      case "PREPARING":
      case "OUT_FOR_DELIVERY":
        return { nextStatus: "DELIVERED", label: "Served" };
      case "DELIVERED":
        return { nextStatus: "TABLE_CLEARED", label: "Table cleared" };
      default:
        return null;
    }
  }

  switch (status) {
    case "PENDING":
      return { nextStatus: "ACCEPTED", label: "Accept" };
    case "ACCEPTED":
      return { nextStatus: "PREPARING", label: "Preparing" };
    case "PREPARING":
      return {
        nextStatus: "OUT_FOR_DELIVERY",
        label:
          fulfillment === "delivery"
            ? "Sent for delivery"
            : "Ready for pickup",
      };
    case "OUT_FOR_DELIVERY":
      return {
        nextStatus: "DELIVERED",
        label:
          fulfillment === "pickup"
            ? "Picked up by customer"
            : "Delivered",
      };
    default:
      return null;
  }
}

export function canEditPosOrder(
  status: string,
  fulfillment: string,
): boolean {
  if (status === "CANCELLED") return false;
  if (fulfillment === "dine_in") {
    return status !== "TABLE_CLEARED";
  }
  return status !== "DELIVERED" && status !== "TABLE_CLEARED";
}

/** Statuses that keep a dine-in table occupied. */
export const DINE_IN_OCCUPYING_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export function customerStatusMessage(
  displayOrderId: string,
  status: OrderStatus,
): string {
  const label = ORDER_STATUS_LABEL[status];
  return `*Khaanz order ${displayOrderId}*\nStatus: *${label}*\nWe'll keep you updated here.`;
}
