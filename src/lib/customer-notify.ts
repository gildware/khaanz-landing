import { customerStatusMessage } from "@/lib/order-status-workflow";
import { toWhatsAppDigitsFromIndian10 } from "@/lib/phone-digits";
import {
  isWhatsAppCloudConfigured,
  sendWhatsAppCloudText,
} from "@/lib/whatsapp-cloud";
import type { OrderStatus } from "@prisma/client";

export async function notifyCustomerWhatsApp(options: {
  phoneDigits10: string;
  body: string;
}): Promise<void> {
  if (!isWhatsAppCloudConfigured()) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[customer WhatsApp skipped — not configured]",
        options.phoneDigits10,
        options.body.slice(0, 80),
      );
    }
    return;
  }
  const toDigits = toWhatsAppDigitsFromIndian10(options.phoneDigits10);
  const r = await sendWhatsAppCloudText({
    toDigits,
    body: options.body,
  });
  if (!r.ok) {
    console.warn("Customer WhatsApp notify failed:", r.error);
  }
}

export async function notifyCustomerOrderPlaced(options: {
  orderRef: string;
  phoneDigits10: string;
  customerName: string;
}): Promise<void> {
  const body = `Hi ${options.customerName}, your Khaanz order is received.\nOrder ID: *${options.orderRef}*\nWe'll update you here as it progresses.`;
  await notifyCustomerWhatsApp({
    phoneDigits10: options.phoneDigits10,
    body,
  });
}

export async function notifyCustomerOrderStatusChange(options: {
  orderRef: string | null;
  orderId: string;
  phoneDigits10: string;
  status: OrderStatus;
}): Promise<void> {
  const displayId =
    options.orderRef ?? `${options.orderId.slice(0, 8)}…`;
  const body = customerStatusMessage(displayId, options.status);
  await notifyCustomerWhatsApp({
    phoneDigits10: options.phoneDigits10,
    body,
  });
}
