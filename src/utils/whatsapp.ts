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
*₹${formatCurrency(grand)}*`;
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

Total: ₹${formatCurrency(grand)}`;
}

/**
 * iOS Safari and Chrome (WebKit) often crash or refuse navigation when `wa.me`
 * URLs exceed a few KB. We cap total URL length and shorten the message if needed.
 */
const WA_ME_MAX_URL_CHARS = 6800;

const WA_TRUNCATION_SUFFIX =
  "\n\n_(Shortened for WhatsApp — your full order was already submitted.)_";

function digitsOnlyPhone(restaurantPhoneDigits: string): string {
  return restaurantPhoneDigits.replace(/\D/g, "");
}

/**
 * Builds a wa.me link that stays within safe length limits for mobile browsers.
 */
export function buildWaMeUrl(
  message: string,
  restaurantPhoneDigits: string,
): { href: string; truncated: boolean } {
  const phone = digitsOnlyPhone(restaurantPhoneDigits);
  const base = `https://wa.me/${phone}?text=`;

  const fits = (body: string) =>
    base.length + encodeURIComponent(body).length <= WA_ME_MAX_URL_CHARS;

  if (fits(message)) {
    return { href: base + encodeURIComponent(message), truncated: false };
  }

  let body = message;
  for (let i = 0; i < 48; i++) {
    const candidate =
      body.length > WA_TRUNCATION_SUFFIX.length + 40
        ? body.slice(
            0,
            Math.max(40, Math.floor(body.length * 0.82) - WA_TRUNCATION_SUFFIX.length),
          ) + WA_TRUNCATION_SUFFIX
        : body.slice(0, Math.max(0, body.length - 120)) + WA_TRUNCATION_SUFFIX;

    if (fits(candidate)) {
      return { href: base + encodeURIComponent(candidate), truncated: true };
    }
    body = body.slice(0, Math.floor(body.length * 0.75));
  }

  const minimal =
    "New order — full details were received on the website. Please check your orders or contact the customer.";
  return {
    href: base + encodeURIComponent(minimal),
    truncated: true,
  };
}

export function getWhatsAppOrderUrl(
  message: string,
  restaurantPhoneDigits: string,
): string {
  return buildWaMeUrl(message, restaurantPhoneDigits).href;
}

/**
 * Opens a wa.me URL after an async gap (e.g. `await fetch`).
 * Safari/iOS blocks `window.open` when it is not synchronous with the user tap;
 * pass a window from `window.open("about:blank", "_blank")` opened in the same
 * synchronous click handler before any `await`.
 */
export function assignWhatsAppOrderUrl(
  url: string,
  preOpenedWindow: Window | null,
): void {
  if (typeof window === "undefined") return;
  if (preOpenedWindow && !preOpenedWindow.closed) {
    try {
      preOpenedWindow.location.href = url;
      return;
    } catch {
      /* fall through — e.g. cross-origin */
    }
  }
  window.location.href = url;
}

export function openWhatsAppOrder(
  payload: WhatsAppOrderPayload,
  restaurantPhoneDigits: string,
  options?: BuildWhatsAppMessageOptions,
): void {
  const url = buildWaMeUrl(
    buildWhatsAppMessage(payload, {
      ...options,
      useWhatsAppFormatting: true,
    }),
    restaurantPhoneDigits,
  ).href;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
