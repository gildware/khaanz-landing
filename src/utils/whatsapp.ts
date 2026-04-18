import { isCartComboLine, type CartItemLine, type CartLine } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import { formatScheduleHuman, type ScheduleMode } from "@/lib/order-schedule";

export interface WhatsAppOrderPayload {
  customerName: string;
  phone: string;
  fulfillment: FulfillmentMode;
  scheduleMode: ScheduleMode;
  /** ISO string when scheduled; null for ASAP */
  scheduledAt: string | null;
  address: string;
  landmark: string;
  notes: string;
  lines: CartLine[];
  latitude: number | null;
  longitude: number | null;
}

export interface BuildWhatsAppMessageOptions {
  /**
   * Public HTTPS URL to the invoice PDF (append to message when the app cannot
   * send the file via WhatsApp Cloud API, e.g. wa.me fallback).
   */
  invoicePublicUrl?: string;
  /**
   * Use WhatsApp-native formatting (*bold*, sections). Recommended for Cloud API
   * and wa.me on mobile.
   */
  useWhatsAppFormatting?: boolean;
}

function formatCurrency(n: number): string {
  return n.toFixed(0);
}

/**
 * Builds the full order summary for WhatsApp (text message or wa.me).
 */
export function buildWhatsAppMessage(
  payload: WhatsAppOrderPayload,
  options?: BuildWhatsAppMessageOptions,
): string {
  const useFmt = options?.useWhatsAppFormatting === true;
  const {
    customerName,
    phone,
    fulfillment,
    scheduleMode,
    scheduledAt,
    address,
    landmark,
    notes,
    lines,
    latitude,
    longitude,
  } = payload;

  const scheduledDate =
    scheduleMode === "scheduled" && scheduledAt
      ? new Date(scheduledAt)
      : null;
  const scheduledValid =
    scheduledDate !== null && !Number.isNaN(scheduledDate.getTime());
  const whenLine =
    scheduleMode === "asap"
      ? fulfillment === "pickup"
        ? "ASAP (pick up when ready)"
        : "ASAP (deliver when ready)"
      : scheduledValid
        ? formatScheduleHuman(scheduleMode, scheduledDate)
        : "Scheduled (time not set)";

  const grand = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  const orderType =
    fulfillment === "pickup"
      ? "Pickup (customer collects)"
      : "Delivery";

  const invoiceBlock =
    options?.invoicePublicUrl && options.invoicePublicUrl.length > 0
      ? useFmt
        ? `\n\n──────────────\n*Invoice PDF*\n${options.invoicePublicUrl}\n_Tap link to download._`
        : `\n\nInvoice PDF:\n${options.invoicePublicUrl}`
      : "";

  if (useFmt) {
    const itemsBlock = lines
      .map((line) => {
        const subtotal = line.unitPrice * line.quantity;
        if (isCartComboLine(line)) {
          const detail = line.componentSummary
            ? `\n  _${line.componentSummary}_`
            : "";
          return `• *${line.name}* (Combo)${detail}\n  ${line.quantity} × ₹${formatCurrency(line.unitPrice)} = *₹${formatCurrency(subtotal)}*`;
        }
        const il = line as CartItemLine;
        const addonPart =
          il.addons.length > 0
            ? ` (${il.addons.map((a) => a.name).join(", ")})`
            : "";
        const lineLabel = `${il.name} (${il.variation.name})${addonPart}`;
        return `• ${lineLabel}\n  ${il.quantity} × ₹${formatCurrency(il.unitPrice)} = *₹${formatCurrency(subtotal)}*`;
      })
      .join("\n\n");

    let locationBlock = "";
    if (fulfillment === "delivery" && latitude != null && longitude != null) {
      locationBlock = `\n\n*Map*\nhttps://www.google.com/maps?q=${latitude},${longitude}`;
    }

    const addressBlock =
      fulfillment === "pickup"
        ? ""
        : `\n\n*Address*\n${address}${landmark ? `\nLandmark: ${landmark}` : ""}`;

    const notesBlock =
      notes.trim().length > 0 ? `\n\n*Notes*\n${notes.trim()}` : "";

    return `*🍽 NEW ORDER*

*Order type*
${orderType}

*When*
${whenLine}

*Customer*
Name: ${customerName}
Phone: +91 ${phone}${addressBlock}${notesBlock}${locationBlock}

*Items*
${itemsBlock}

*Total*
*₹${formatCurrency(grand)}*${invoiceBlock}`;
  }

  const itemsBlock = lines
    .map((line) => {
      const subtotal = line.unitPrice * line.quantity;
      if (isCartComboLine(line)) {
        const detail = line.componentSummary
          ? ` — ${line.componentSummary}`
          : "";
        return `${line.name} (Combo)${detail} x ${line.quantity} = ₹${formatCurrency(subtotal)}`;
      }
      const il = line as CartItemLine;
      const addonPart =
        il.addons.length > 0
          ? ` (${il.addons.map((a) => a.name).join(", ")})`
          : "";
      return `${il.name} (${il.variation.name})${addonPart} x ${il.quantity} = ₹${formatCurrency(subtotal)}`;
    })
    .join("\n");

  let locationBlock = "";
  if (fulfillment === "delivery" && latitude != null && longitude != null) {
    locationBlock = `\nLocation:\nLatitude: ${latitude}\nLongitude: ${longitude}\nMap: https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const addressBlock =
    fulfillment === "pickup"
      ? ""
      : `\nDelivery address: ${address}\nLandmark: ${landmark}`;

  return `New Order

Order type: ${orderType}
When: ${whenLine}

Customer Details:
Name: ${customerName}
Phone: ${phone}${addressBlock}
Notes: ${notes}${locationBlock}

Items:
${itemsBlock}

Total: ₹${formatCurrency(grand)}${invoiceBlock}`;
}

export function getWhatsAppOrderUrl(
  message: string,
  restaurantPhoneDigits: string,
): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${restaurantPhoneDigits}?text=${encoded}`;
}

export function openWhatsAppOrder(
  payload: WhatsAppOrderPayload,
  restaurantPhoneDigits: string,
  options?: BuildWhatsAppMessageOptions,
): void {
  const url = getWhatsAppOrderUrl(
    buildWhatsAppMessage(payload, {
      ...options,
      useWhatsAppFormatting: true,
    }),
    restaurantPhoneDigits,
  );
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
