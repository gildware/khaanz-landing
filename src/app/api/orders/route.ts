import { randomUUID } from "crypto";

import { after } from "next/server";
import { cookies } from "next/headers";

import {
  CUSTOMER_TOKEN_COOKIE,
  verifyCustomerToken,
} from "@/lib/customer-auth";
import { notifyCustomerOrderPlaced } from "@/lib/customer-notify";
import { normalizeIndianMobileDigits } from "@/lib/phone-digits";
import { persistOrderToDatabase } from "@/lib/persist-order-db";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { isChannelOpenAt } from "@/lib/restaurant-hours";
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
    const cookieStore = await cookies();
    const customerSession = await verifyCustomerToken(
      cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value,
    );
    if (!customerSession) {
      return Response.json(
        {
          error:
            "Please sign in with your phone before ordering. Open Account → Sign in.",
        },
        { status: 401 },
      );
    }

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

    const checkoutDigits = normalizeIndianMobileDigits(parsed.phone);
    if (customerSession.phoneDigits !== checkoutDigits) {
      return Response.json(
        {
          error:
            "Phone number on this order must match your signed-in account.",
        },
        { status: 403 },
      );
    }

    const orderId = randomUUID();
    const settings = await readRestaurantSettings();

    if (
      parsed.scheduleMode === "scheduled" &&
      parsed.scheduledAt &&
      (parsed.fulfillment === "pickup" || parsed.fulfillment === "delivery")
    ) {
      const when = new Date(parsed.scheduledAt);
      const channel = parsed.fulfillment === "pickup" ? "pickup" : "delivery";
      if (!isChannelOpenAt(settings, channel, when)) {
        return Response.json(
          {
            error:
              "Scheduled time must fall within restaurant hours for the selected option.",
          },
          { status: 400 },
        );
      }
    }

    const cloudConfigured = isWhatsAppCloudConfigured();

    let orderRef: string;
    try {
      const out = await persistOrderToDatabase(
        orderId,
        parsed,
        cloudConfigured,
        customerSession,
      );
      orderRef = out.orderRef;
    } catch (e) {
      console.error("Order DB persist failed:", e);
      const msg =
        e instanceof Error &&
        (e.message === "SESSION_PHONE_MISMATCH" ||
          e.message === "SESSION_CUSTOMER_INVALID")
          ? "Session invalid. Please sign in again."
          : "Could not save order. Check database configuration.";
      const status =
        e instanceof Error &&
        (e.message === "SESSION_PHONE_MISMATCH" ||
          e.message === "SESSION_CUSTOMER_INVALID")
          ? 403
          : 503;
      return Response.json({ error: msg }, { status });
    }

    const waPayload: WhatsAppOrderPayload = {
      orderRef,
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

    if (cloudConfigured) {
      const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN!.trim();
      const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID!.trim();
      const toDigits = settings.whatsappPhoneE164;
      const customerDigits = customerSession.phoneDigits;
      const customerName = parsed.customerName;

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
        try {
          await notifyCustomerOrderPlaced({
            orderRef,
            phoneDigits10: customerDigits,
            customerName,
          });
        } catch (e) {
          console.error("Customer order-placed notify threw:", e);
        }
      });
    } else {
      after(async () => {
        try {
          await notifyCustomerOrderPlaced({
            orderRef,
            phoneDigits10: customerSession.phoneDigits,
            customerName: parsed.customerName,
          });
        } catch (e) {
          console.error("Customer order-placed notify threw:", e);
        }
      });
    }

    return Response.json({
      orderId,
      orderRef,
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
