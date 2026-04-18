import {
  isScheduledTimeAllowed,
  type ScheduleMode,
} from "@/lib/order-schedule";
import type { CartLine, MenuAddon, MenuVariation } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";

export interface OrderCreateParsed {
  customerName: string;
  phone: string;
  fulfillment: FulfillmentMode;
  scheduleMode: ScheduleMode;
  scheduledAt: string | null;
  address: string;
  landmark: string;
  notes: string;
  lines: CartLine[];
  latitude: number | null;
  longitude: number | null;
}

function isIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ""));
}

function isVariation(x: unknown): x is MenuVariation {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.price === "number" &&
    Number.isFinite(o.price)
  );
}

function isAddon(x: unknown): x is MenuAddon {
  return isVariation(x);
}

function isCartComboLineRow(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.kind !== "combo") return false;
  return (
    typeof o.lineId === "string" &&
    typeof o.comboId === "string" &&
    typeof o.name === "string" &&
    typeof o.image === "string" &&
    typeof o.componentSummary === "string" &&
    (typeof o.isVeg === "boolean" || o.isVeg === undefined) &&
    typeof o.quantity === "number" &&
    Number.isInteger(o.quantity) &&
    o.quantity >= 1 &&
    typeof o.unitPrice === "number" &&
    Number.isFinite(o.unitPrice)
  );
}

function isCartItemLineRow(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.kind === "combo") return false;
  if (o.kind !== undefined && o.kind !== "item") return false;
  if (
    typeof o.lineId !== "string" ||
    typeof o.itemId !== "string" ||
    typeof o.name !== "string" ||
    typeof o.image !== "string" ||
    (typeof o.isVeg !== "boolean" && o.isVeg !== undefined) ||
    typeof o.quantity !== "number" ||
    !Number.isInteger(o.quantity) ||
    o.quantity < 1 ||
    typeof o.unitPrice !== "number" ||
    !Number.isFinite(o.unitPrice)
  ) {
    return false;
  }
  if (!isVariation(o.variation)) return false;
  if (!Array.isArray(o.addons)) return false;
  if (!o.addons.every(isAddon)) return false;
  return true;
}

function isCartLine(x: unknown): x is CartLine {
  return isCartComboLineRow(x) || isCartItemLineRow(x);
}

export function parseOrderCreateBody(
  body: unknown,
): OrderCreateParsed | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid JSON body." };
  }
  const o = body as Record<string, unknown>;

  const customerName =
    typeof o.customerName === "string" ? o.customerName.trim() : "";
  const phone = typeof o.phone === "string" ? o.phone.trim() : "";
  const fulfillment = o.fulfillment;
  const scheduleMode = o.scheduleMode;
  const scheduledAt =
    o.scheduledAt === null
      ? null
      : typeof o.scheduledAt === "string"
        ? o.scheduledAt
        : null;
  const address = typeof o.address === "string" ? o.address.trim() : "";
  const landmark = typeof o.landmark === "string" ? o.landmark.trim() : "";
  const notes = typeof o.notes === "string" ? o.notes.trim() : "";
  const latitude =
    o.latitude === null
      ? null
      : typeof o.latitude === "number" && Number.isFinite(o.latitude)
        ? o.latitude
        : null;
  const longitude =
    o.longitude === null
      ? null
      : typeof o.longitude === "number" && Number.isFinite(o.longitude)
        ? o.longitude
        : null;

  if (!customerName) {
    return { error: "Name is required." };
  }
  if (!isIndianMobile(phone)) {
    return { error: "Enter a valid 10-digit mobile number." };
  }
  if (fulfillment !== "pickup" && fulfillment !== "delivery") {
    return { error: "Invalid fulfillment mode." };
  }
  if (scheduleMode !== "asap" && scheduleMode !== "scheduled") {
    return { error: "Invalid schedule mode." };
  }
  if (scheduleMode === "scheduled") {
    if (!scheduledAt) {
      return { error: "Scheduled time is required." };
    }
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime()) || !isScheduledTimeAllowed(d)) {
      return { error: "Scheduled time is not allowed." };
    }
  } else if (scheduledAt !== null) {
    return { error: "Invalid scheduled time." };
  }

  if (fulfillment === "delivery" && !address) {
    return { error: "Address is required for delivery." };
  }

  if (!Array.isArray(o.lines) || o.lines.length === 0) {
    return { error: "Cart is empty." };
  }
  if (!o.lines.every(isCartLine)) {
    return { error: "Invalid cart lines." };
  }

  const lines: CartLine[] = (o.lines as unknown[]).map((row) => {
    const l = row as Record<string, unknown>;
    if (l.kind === "combo") {
      return {
        kind: "combo" as const,
        lineId: l.lineId as string,
        comboId: l.comboId as string,
        name: l.name as string,
        image: l.image as string,
        isVeg: typeof l.isVeg === "boolean" ? l.isVeg : true,
        quantity: l.quantity as number,
        unitPrice: l.unitPrice as number,
        componentSummary: l.componentSummary as string,
      };
    }
    return {
      kind: "item" as const,
      lineId: l.lineId as string,
      itemId: l.itemId as string,
      name: l.name as string,
      image: l.image as string,
      isVeg: typeof l.isVeg === "boolean" ? l.isVeg : true,
      variation: l.variation as MenuVariation,
      addons: l.addons as MenuAddon[],
      quantity: l.quantity as number,
      unitPrice: l.unitPrice as number,
    };
  });

  return {
    customerName,
    phone,
    fulfillment,
    scheduleMode,
    scheduledAt: scheduleMode === "scheduled" ? scheduledAt : null,
    address: fulfillment === "delivery" ? address : "",
    landmark: fulfillment === "delivery" ? landmark : "",
    notes,
    lines,
    latitude: fulfillment === "delivery" ? latitude : null,
    longitude: fulfillment === "delivery" ? longitude : null,
  };
}
