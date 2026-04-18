import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import { after } from "next/server";

import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { readRestaurantSettings } from "@/lib/settings-repository";
import {
  isWhatsAppCloudConfigured,
  sendRestaurantOrderViaWhatsAppCloud,
} from "@/lib/whatsapp-cloud";
import {
  buildWhatsAppMessage,
  type WhatsAppOrderPayload,
} from "@/utils/whatsapp";

export const runtime = "nodejs";

const INVOICES_DIR = join(process.cwd(), "data", "invoices");

function restaurantDisplayName(): string {
  const n = process.env.RESTAURANT_INVOICE_NAME?.trim();
  return n && n.length > 0 ? n : "Khaanz";
}

export async function POST(req: Request) {
  try {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseOrderCreateBody(json);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const orderId = randomUUID();
  const createdAt = new Date();
  const settings = await readRestaurantSettings();

  const invoiceInput = {
    orderId,
    createdAt,
    restaurantName: restaurantDisplayName(),
    customerName: parsed.customerName,
    phone: parsed.phone,
    fulfillment: parsed.fulfillment,
    scheduleMode: parsed.scheduleMode,
    scheduledAt: parsed.scheduledAt,
    address: parsed.address,
    landmark: parsed.landmark,
    notes: parsed.notes,
    lines: parsed.lines,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildInvoicePdf(invoiceInput);
  } catch (e) {
    console.error("invoice pdf failed", e);
    return Response.json(
      { error: "Could not generate invoice." },
      { status: 500 },
    );
  }

  try {
    await mkdir(INVOICES_DIR, { recursive: true });
    await writeFile(
      join(INVOICES_DIR, `${orderId}.pdf`),
      Buffer.from(pdfBytes),
    );
  } catch (e) {
    console.error("invoice write failed", e);
    return Response.json(
      { error: "Could not save invoice." },
      { status: 500 },
    );
  }

  const waPayload: WhatsAppOrderPayload = {
    customerName: parsed.customerName,
    phone: parsed.phone,
    fulfillment: parsed.fulfillment,
    scheduleMode: parsed.scheduleMode,
    scheduledAt: parsed.scheduledAt,
    address: parsed.address,
    landmark: parsed.landmark,
    notes: parsed.notes,
    lines: parsed.lines,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
  };

  const orderSummaryText = buildWhatsAppMessage(waPayload, {
    useWhatsAppFormatting: true,
  });
  const shortOrderRef = orderId.replace(/-/g, "").slice(0, 12);
  const documentCaption = `📄 *Invoice PDF*\nOrder #${shortOrderRef}\n_Tap to open this PDF for the full tax invoice._`;

  /**
   * WhatsApp Graph calls can take 10s+ and cause the browser or serverless
   * runtime to time out before JSON is returned. Send after the response is
   * flushed so checkout always completes quickly.
   */
  const cloudConfigured = isWhatsAppCloudConfigured();
  if (cloudConfigured) {
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN!.trim();
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID!.trim();
    const toDigits = settings.whatsappPhoneE164;
    const filename = `Khaanz-Invoice-${shortOrderRef}.pdf`;

    after(async () => {
      try {
        const send = await sendRestaurantOrderViaWhatsAppCloud({
          accessToken: token,
          phoneNumberId,
          toDigits,
          pdfBytes,
          filename,
          orderSummaryText,
          documentCaption,
        });
        if (!send.documentSent) {
          console.error("WhatsApp Cloud send failed:", send.lastError);
        }
      } catch (e) {
        console.error("WhatsApp Cloud send threw:", e);
      }
    });
  }

  return Response.json({
    orderId,
    /** True when Cloud API env is set — actual delivery runs in background via `after()`. */
    invoiceSentViaWhatsApp: cloudConfigured,
  });
  } catch (e) {
    console.error("POST /api/orders failed:", e);
    return Response.json(
      { error: "Could not place order. Try again." },
      { status: 500 },
    );
  }
}
