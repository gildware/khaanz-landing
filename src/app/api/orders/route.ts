import { randomUUID } from "crypto";

import { after } from "next/server";

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
    const settings = await readRestaurantSettings();

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

    const cloudConfigured = isWhatsAppCloudConfigured();
    if (cloudConfigured) {
      const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN!.trim();
      const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID!.trim();
      const toDigits = settings.whatsappPhoneE164;

      after(async () => {
        try {
          const send = await sendRestaurantOrderViaWhatsAppCloud({
            accessToken: token,
            phoneNumberId,
            toDigits,
            orderSummaryText,
          });
          if (!send.textSent) {
            console.error("WhatsApp Cloud send failed:", send.lastError);
          }
        } catch (e) {
          console.error("WhatsApp Cloud send threw:", e);
        }
      });
    }

    return Response.json({
      orderId,
      /** True when Cloud API env is set — delivery runs in background via `after()`. */
      messageSentViaWhatsApp: cloudConfigured,
    });
  } catch (e) {
    console.error("POST /api/orders failed:", e);
    return Response.json(
      { error: "Could not place order. Try again." },
      { status: 500 },
    );
  }
}
