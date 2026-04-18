import type { CartLine } from "@/types/menu";

const RESTAURANT_WHATSAPP = "919876543210";

export interface WhatsAppOrderPayload {
  customerName: string;
  phone: string;
  address: string;
  landmark: string;
  notes: string;
  lines: CartLine[];
  latitude: number | null;
  longitude: number | null;
}

function formatCurrency(n: number): string {
  return n.toFixed(0);
}

export function buildWhatsAppMessage(payload: WhatsAppOrderPayload): string {
  const {
    customerName,
    phone,
    address,
    landmark,
    notes,
    lines,
    latitude,
    longitude,
  } = payload;

  const itemsBlock = lines
    .map((line) => {
      const subtotal = line.unitPrice * line.quantity;
      const addonPart =
        line.addons.length > 0
          ? ` (${line.addons.map((a) => a.name).join(", ")})`
          : "";
      return `${line.name} (${line.variation.name})${addonPart} x ${line.quantity} = ₹${formatCurrency(subtotal)}`;
    })
    .join("\n");

  const grand = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  let locationBlock = "";
  if (latitude != null && longitude != null) {
    locationBlock = `\nLocation:\nLatitude: ${latitude}\nLongitude: ${longitude}\nMap: https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  return `New Order

Customer Details:
Name: ${customerName}
Phone: ${phone}
Address: ${address}
Landmark: ${landmark}
Notes: ${notes}${locationBlock}

Items:
${itemsBlock}

Total: ₹${formatCurrency(grand)}`;
}

export function getWhatsAppOrderUrl(message: string): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${RESTAURANT_WHATSAPP}?text=${encoded}`;
}

export function openWhatsAppOrder(payload: WhatsAppOrderPayload): void {
  const url = getWhatsAppOrderUrl(buildWhatsAppMessage(payload));
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
